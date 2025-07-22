---
title: "Building the Universe: Technical Architecture for Massive Real-Time Ship Construction in Stars Beyond"
date: "2025-7-7"
categories: ["Graphics", "Multiplayer", "Gaming", "UE5", "C++"] 
tags: []
---

*How Far Beyond is tackling the challenge of supporting hundreds of thousands of interactive ship parts in real-time multiplayer*

## The Challenge: Engineering at Galactic Scale

Picture this: You're piloting a massive starship through the void of space. Your ship isn't just a static model—it's a living, breathing construction of **hundreds of thousands of individual parts**, each one damageable, interactive, and modifiable. Your crew is simultaneously building new sections, repairing battle damage, and reconfiguring systems, all while the ship barrels through space at incredible speeds. Other players are doing the same across the galaxy, and the server needs to track every bolt, beam, and bulkhead in real-time.

This is the technical mountain that Stars Beyond, our game at Far Beyond, is climbing. It's a problem that sits at the intersection of rendering performance, physics simulation, networking architecture, and memory management—all while maintaining the seamless, responsive experience that modern players expect.

## The Technical Landscape: Why This is Hard

### The Scale Problem

Most games handle construction through relatively simple approaches:
- **Static prefabs**: Pre-built structures that can't be modified
- **Small-scale building**: Hundreds or thousands of parts, not hundreds of thousands
- **Turn-based or pause-based construction**: Building happens when gameplay stops

For *Stars Beyond* we want to throw all of these limitations out the airlock. Ships should support:

- **Massive part counts**: Targeting 100,000+ individual components per ship
- **Real-time construction**: Building and modification during active gameplay
- **Full interactivity**: Every part can be damaged, removed, or modified
- **Multiplayer coordination**: Multiple players building simultaneously
- **3D mobility**: Ships move, rotate, and accelerate freely through space
- **Combat integration**: Parts can be destroyed and must affect ship performance

### The Performance Cliff

The naive approach—creating a separate game object for each part—hits a performance wall almost immediately. Consider the computational load:

- **Rendering**: 100,000 draw calls per ship would instantly crash most GPUs on just one craft
- **Physics**: Individual collision detection for each part creates exponential complexity
- **Memory**: Each object carries overhead that scales linearly with part count
- **Networking**: Replicating state changes for every part creates bandwidth explosion

Traditional game engines like Unreal Engine 5 start showing strain at around 10,000-50,000 individual actors, depending on their complexity. *Stars Beyond* needs to handle 2-10x that scale while maintaining 60+ FPS performance.

## Architecture Deep Dive: The Solutions

### 1. Hierarchical Instanced Static Meshes (HISM): The Rendering Foundation

**What it is**: HISM is Unreal Engine's system for rendering thousands of identical objects efficiently by sending transform data to the GPU as a single batch.

**Why it works for ship construction**:
```cpp
// Simplified example of HISM usage
class AShipHull : public AActor
{
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    UHierarchicalInstancedStaticMeshComponent* HullBlocks;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    UHierarchicalInstancedStaticMeshComponent* ArmorPlates;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    UHierarchicalInstancedStaticMeshComponent* WeaponMounts;
};

// Adding a new block is extremely fast
int32 NewBlockIndex = HullBlocks->AddInstance(BlockTransform);

// Removing blocks requires careful batching
TArray<int32> BlocksToRemove;
// ... populate removal list ...
HullBlocks->RemoveInstances(BlocksToRemove);
```

**Performance characteristics**:
- **Rendering**: Single draw call per mesh type, regardless of instance count
- **Transform updates**: GPU-accelerated matrix transformations
- **Memory**: Shared mesh data with per-instance transform matrices
- **Scalability**: Tested stable up to 100,000+ instances per component

**Trade-offs**:
- ✅ Exceptional rendering performance
- ✅ Fast addition of new parts
- ✅ Efficient transform updates for ship movement
- ❌ No per-instance collision by default
- ❌ Removing parts can cause array reallocation overhead
- ❌ Limited per-part logic without additional systems

### 2. Nanite Virtualized Geometry: Next-Generation Rendering

**What it is**: Unreal Engine 5's Nanite system treats complex meshes as streaming, level-of-detail managed assets that scale to millions of triangles.

**Integration with HISM**:
```cpp
// Nanite-enabled static mesh for ship parts
UPROPERTY(EditAnywhere, BlueprintReadWrite)
UStaticMesh* NaniteEnabledHullMesh;

void AShipHull::InitializeNaniteHISM()
{
    // Enable Nanite on the static mesh
    HullBlocks->SetStaticMesh(NaniteEnabledHullMesh);
    
    // Configure for optimal Nanite performance
    HullBlocks->SetCullDistances(0, 50000); // No culling - let Nanite handle LOD
    HullBlocks->SetInstancingRandomSeed(GetUniqueID());
}
```

**Performance benefits**:
- **GPU-side culling**: Nanite automatically culls non-visible geometry
- **Automatic LOD**: Distance-based detail reduction happens seamlessly
- **Memory streaming**: Only visible geometry detail is loaded
- **Scalability**: Supports millions of triangles with consistent performance

**Implementation considerations**:
- Requires careful balance between Nanite overhead and traditional rendering
- Best results with complex, detailed meshes rather than simple geometric shapes
- CPU-side optimizations still necessary for gameplay logic

### 3. Mass Entity Component System (ECS): The Logic Layer

**What it is**: Unreal Engine 5's Mass ECS is a data-oriented system designed for processing thousands of entities efficiently.

**Why it's crucial for ship parts**:
```cpp
// Mass processor for ship part updates
UCLASS()
class STARSBEYOND_API UShipPartProcessor : public UMassProcessor
{
    GENERATED_BODY()

public:
    UShipPartProcessor();
    
protected:
    virtual void ConfigureQueries() override;
    virtual void Execute(UMassEntitySubsystem& EntitySubsystem, 
                        FMassExecutionContext& Context) override;

private:
    FMassEntityQuery PartQuery;
};

// Fragment for ship part data
USTRUCT()
struct FShipPartFragment : public FMassFragment
{
    GENERATED_BODY()
    
    float Health = 100.0f;
    float MaxHealth = 100.0f;
    EShipPartType PartType = EShipPartType::Hull;
    int32 HISMInstanceIndex = -1;
    bool bNeedsPhysicsUpdate = false;
};
```

**Performance characteristics**:
- **Batch processing**: Updates thousands of parts in tight loops
- **Cache-friendly**: Data-oriented design improves CPU cache usage
- **Scalable**: Linear performance scaling with entity count
- **Memory efficient**: Packed data structures reduce memory overhead

**Integration with HISM**:
```cpp
void UShipPartProcessor::Execute(UMassEntitySubsystem& EntitySubsystem, 
                                FMassExecutionContext& Context)
{
    // Process parts in batches for optimal performance
    PartQuery.ForEachEntityChunk(EntitySubsystem, Context, 
        [this](FMassExecutionContext& Context)
        {
            auto Parts = Context.GetMutableFragmentView<FShipPartFragment>();
            auto Transforms = Context.GetMutableFragmentView<FTransformFragment>();
            
            // Batch update HISM instances
            TArray<int32> InstancesToUpdate;
            TArray<FTransform> NewTransforms;
            
            for (int32 i = 0; i < Context.GetNumEntities(); ++i)
            {
                if (Parts[i].bNeedsPhysicsUpdate)
                {
                    InstancesToUpdate.Add(Parts[i].HISMInstanceIndex);
                    NewTransforms.Add(Transforms[i].GetTransform());
                    Parts[i].bNeedsPhysicsUpdate = false;
                }
            }
            
            // Single batch update call
            if (InstancesToUpdate.Num() > 0)
            {
                ShipHISM->BatchUpdateInstancesTransforms(InstancesToUpdate, NewTransforms);
            }
        });
}
```

### 4. Instanced Actors Plugin: Bridging the Gap

**What it is**: Epic's experimental plugin (UE 5.5+) that automatically converts actors to Mass ECS entities when they're outside player interaction range.

**Why it's revolutionary for ship construction**:
```cpp
// Actor that can be virtualized
UCLASS()
class STARSBEYOND_API AShipPart : public AActor, public IInstancedActorInterface
{
    GENERATED_BODY()

public:
    AShipPart();
    
    // IInstancedActorInterface
    virtual bool ShouldBeInstancedActor() const override { return true; }
    virtual float GetInstancedActorVisualizationRange() const override { return 5000.0f; }
    
protected:
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    UStaticMeshComponent* PartMesh;
    
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly)
    UBoxComponent* InteractionCollision;
    
    // Part-specific logic
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PartHealth = 100.0f;
    
    UFUNCTION(BlueprintCallable)
    void TakeDamage(float DamageAmount);
};
```

**Virtualization benefits**:
- **Seamless transition**: Parts automatically convert between full actors and ECS entities
- **Per-part interaction**: Close parts maintain full actor functionality
- **Scalability**: Distant parts use efficient ECS processing
- **Compatibility**: Existing actor-based logic continues to work

**Implementation workflow**:
1. **Author as actors**: Design parts using familiar actor-based tools
2. **Automatic conversion**: Plugin handles ECS conversion based on distance
3. **Batch processing**: Distant parts processed efficiently via Mass ECS
4. **Dynamic promotion**: Parts convert back to actors when players approach

### 5. Asynchronous Physics Cooking: Keeping the Game Thread Responsive

**The problem**: Recalculating collision for massive ships can cause frame drops of several seconds.

**The solution**: Background physics cooking with hot-swapping:

```cpp
class AShipHull : public AActor
{
private:
    // Current physics state
    UPROPERTY()
    UBodySetup* CurrentBodySetup;
    
    // Cooking state
    FPhysicsCookingHandle ActiveCookingHandle;
    bool bPhysicsCookingInProgress = false;
    
    // Fallback collision for immediate response
    UPROPERTY()
    UBoxComponent* FallbackCollision;

public:
    void RequestPhysicsRebuild();
    void OnPhysicsCookingComplete(FPhysicsCookingHandle Handle);
    void ApplyNewPhysicsState(UBodySetup* NewBodySetup);
};

void AShipHull::RequestPhysicsRebuild()
{
    if (bPhysicsCookingInProgress)
    {
        // Cancel existing cook and start new one
        UPhysicsSettings::Get()->CancelPhysicsCook(ActiveCookingHandle);
    }
    
    // Create new body setup with current part configuration
    UBodySetup* NewBodySetup = NewObject<UBodySetup>(this);
    ConfigureBodySetupFromParts(NewBodySetup);
    
    // Start async cooking
    ActiveCookingHandle = NewBodySetup->CreatePhysicsMeshesAsync(
        FOnAsyncPhysicsCookFinished::CreateUObject(this, &AShipHull::OnPhysicsCookingComplete)
    );
    
    bPhysicsCookingInProgress = true;
    
    // Update fallback collision immediately
    UpdateFallbackCollision();
}

void AShipHull::OnPhysicsCookingComplete(FPhysicsCookingHandle Handle)
{
    if (Handle == ActiveCookingHandle)
    {
        bPhysicsCookingInProgress = false;
        
        // Hot-swap the physics state
        UBodySetup* NewBodySetup = Handle.GetBodySetup();
        ApplyNewPhysicsState(NewBodySetup);
        
        // Disable fallback collision
        FallbackCollision->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    }
}
```

**Performance benefits**:
- **Responsive gameplay**: Main thread never blocks on physics cooking
- **Immediate feedback**: Fallback collision provides instant response
- **Scalability**: Cooking time scales independently of gameplay framerate
- **Memory efficiency**: Old physics data cleaned up after successful swap

### 6. Delta-Based Networking: Minimizing Bandwidth Explosion

**The challenge**: Replicating changes to hundreds of thousands of parts would overwhelm network bandwidth.

**The solution**: Delta-based replication using `FFastArraySerializer`:

```cpp
// Ship part delta for networking
USTRUCT()
struct FShipPartDelta : public FFastArraySerializerItem
{
    GENERATED_BODY()
    
    UPROPERTY()
    int32 PartID;
    
    UPROPERTY()
    EShipPartOperation Operation; // Add, Remove, Modify
    
    UPROPERTY()
    FTransform PartTransform;
    
    UPROPERTY()
    EShipPartType PartType;
    
    UPROPERTY()
    float Health;
    
    // FFastArraySerializerItem interface
    void PostReplicatedAdd(const struct FShipPartArray& InArraySerializer);
    void PostReplicatedChange(const struct FShipPartArray& InArraySerializer);
    void PreReplicatedRemove(const struct FShipPartArray& InArraySerializer);
};

// Fast array for ship parts
USTRUCT()
struct FShipPartArray : public FFastArraySerializer
{
    GENERATED_BODY()
    
    UPROPERTY()
    TArray<FShipPartDelta> Parts;
    
    // FFastArraySerializer interface
    bool NetDeltaSerialize(FNetDeltaSerializeInfo& DeltaParms)
    {
        return FFastArraySerializer::FastArrayDeltaSerialize<FShipPartDelta, FShipPartArray>(Parts, DeltaParms, *this);
    }
};
```

**Networking optimizations**:
```cpp
class AShipHull : public AActor
{
private:
    UPROPERTY(Replicated)
    FShipPartArray ReplicatedParts;
    
    // Batching for efficient replication
    TArray<FShipPartDelta> PendingDeltas;
    FTimerHandle ReplicationBatchTimer;
    
public:
    void AddPart(EShipPartType PartType, const FTransform& Transform);
    void RemovePart(int32 PartID);
    void ModifyPart(int32 PartID, const FTransform& NewTransform);
    
private:
    void BatchReplicationDeltas();
    void FlushPendingDeltas();
};

void AShipHull::BatchReplicationDeltas()
{
    // Batch multiple operations into single network packet
    for (const auto& Delta : PendingDeltas)
    {
        ReplicatedParts.Parts.Add(Delta);
    }
    
    PendingDeltas.Empty();
    
    // Mark for replication
    ReplicatedParts.MarkArrayDirty();
}
```

**Bandwidth benefits**:
- **Delta compression**: Only changes are transmitted, not full state
- **Batching**: Multiple operations combined into single packets
- **Selective replication**: Only relevant changes sent to each client
- **Scalability**: Bandwidth scales with change rate, not total part count

## Implementation Strategies: Putting It All Together

### The Hybrid Approach

*Stars Beyond* doesn't rely on a single technique—it combines multiple approaches strategically:

```cpp
class AStarshipArchitect : public AActor
{
private:
    // Rendering layer - HISM for performance
    UPROPERTY(VisibleAnywhere)
    TMap<EShipPartType, UHierarchicalInstancedStaticMeshComponent*> PartRenderers;
    
    // Logic layer - Mass ECS for distant parts
    UPROPERTY()
    UMassEntitySubsystem* MassSubsystem;
    
    // Interaction layer - Instanced actors for nearby parts
    UPROPERTY()
    TArray<AShipPart*> InteractableParts;
    
    // Physics layer - Async cooking system
    UPROPERTY()
    UShipPhysicsManager* PhysicsManager;
    
    // Networking layer - Delta replication
    UPROPERTY(Replicated)
    FShipPartArray NetworkedParts;
    
public:
    void AddPart(EShipPartType PartType, const FTransform& Transform, bool bImmediate = false);
    void RemovePart(int32 PartID, bool bImmediate = false);
    void UpdatePartTransform(int32 PartID, const FTransform& NewTransform);
    
private:
    void ProcessPartAddition(const FShipPartData& PartData);
    void ProcessPartRemoval(int32 PartID);
    void UpdateRenderingLayer();
    void UpdatePhysicsLayer();
    void UpdateNetworkingLayer();
};
```

### Performance Optimization Pipeline

1. **Spatial partitioning**: Parts are organized by proximity for efficient batch processing
2. **LOD management**: Distant parts use simplified collision and rendering
3. **Update frequency scaling**: Critical parts update every frame, others less frequently
4. **Memory pooling**: Reuse objects to minimize garbage collection pressure
5. **Multithreading**: Physics cooking and mesh updates happen on worker threads

### Quality Assurance: Testing at Scale

Testing massive-scale systems requires specialized approaches:

```cpp
// Automated stress testing
class FShipStressTester
{
private:
    static constexpr int32 TARGET_PART_COUNT = 100000;
    static constexpr int32 SIMULTANEOUS_BUILDERS = 64;
    static constexpr float TEST_DURATION_SECONDS = 600.0f;
    
public:
    void RunStressTest();
    void SimulateConstruction();
    void SimulateCombatDamage();
    void SimulateNetworkLatency();
    void MeasurePerformance();
    
private:
    FPerformanceMetrics CollectMetrics();
    void ValidateSystemStability();
};
```

**Testing scenarios**:
- **Construction stress**: 64 players building simultaneously
- **Combat simulation**: Rapid part destruction and reconstruction
- **Network saturation**: High-latency, high-packet-loss conditions
- **Memory pressure**: Extended gameplay sessions with no restarts
- **Platform diversity**: Testing across different hardware configurations

## Lessons Learned: What Didn't Work

### Rejected Approaches

**Actor-per-part hierarchies**: 
```cpp
// This approach doesn't scale
class AShipPart : public AActor
{
    UPROPERTY(VisibleAnywhere)
    UStaticMeshComponent* PartMesh;
    
    UPROPERTY(VisibleAnywhere)
    UBoxComponent* Collision;
    
    // Multiplied by 100,000 parts = disaster
};
```
*Problem*: Linear scaling of CPU overhead, memory usage, and update costs.

**Runtime mesh merging**:
```cpp
// Too slow for real-time use
void AMergedShipHull::RebuildMergedMesh()
{
    // This takes 5-10 seconds for large ships
    TArray<FStaticMeshLODResources> LODResources;
    for (auto& Part : ShipParts)
    {
        MergeStaticMeshLOD(Part.Mesh, LODResources);
    }
    
    // Blocks game thread unacceptably
    ApplyMergedMesh(LODResources);
}
```
*Problem*: Mesh merging takes seconds, not milliseconds.

**World origin rebasing per ship**:
```cpp
// Unreal Engine limitation
void AShipHull::UpdateShipOrigin()
{
    // This affects the entire world, not just one ship
    GetWorld()->RequestNewWorldOrigin(GetActorLocation());
}
```
*Problem*: World origin rebasing is global, not per-object.

### Performance Pitfalls

**Premature optimization**: Early prototypes spent too much time optimizing systems that weren't actually bottlenecks.

**Synchronous operations**: Blocking the game thread for any operation longer than 1-2 milliseconds creates noticeable stuttering.

**Memory fragmentation**: Frequent allocation and deallocation of large objects caused memory fragmentation and garbage collection spikes.

**Network chattiness**: Early networking sent every part state change immediately, overwhelming bandwidth.

## The Road Ahead: Future Optimizations

### Planned Improvements

**GPU-driven rendering**: Moving transform calculations entirely to GPU compute shaders
**Predictive physics**: Using machine learning to predict collision states
**Distributed processing**: Offloading complex calculations to dedicated server clusters
**Compression advances**: Exploring neural network-based compression for part data

### Research Questions

Several technical challenges remain open:

1. **Optimal LOD transitions**: When should parts switch between full actors and ECS entities?
2. **Physics prediction**: How can we predict collision outcomes to reduce cooking frequency?
3. **Bandwidth optimization**: Can we compress part deltas further using temporal prediction?
4. **Memory scaling**: What's the practical upper limit for part count on current hardware?

## Conclusion: Building the Future

*Stars Beyond* represents a new frontier in MMO technical architecture. By combining cutting-edge rendering techniques with innovative networking approaches, the game pushes the boundaries of what's possible in real-time multiplayer construction.

The solutions explored here—HISM rendering, Mass ECS processing, asynchronous physics cooking, and delta-based networking—form a comprehensive toolkit for handling massive-scale interactive systems. While the specific implementation is tailored to starship construction, the techniques apply broadly to any game requiring large numbers of interactive objects.

The key insight is that no single approach can solve the massive-scale problem alone. Success comes from the careful orchestration of multiple specialized systems, each optimized for its specific role in the overall architecture.

As we continue developing *Stars Beyond*, we're not just building a game—we're pioneering the technical foundations for the next generation of persistent, large-scale virtual worlds. The universe is vast, and the ships we build within it will be limited only by our imagination and our ability to engineer systems that can bring those dreams to life.

---

*The Stars Beyond development team continues to push the boundaries of what's possible in real-time multiplayer construction. Follow our development blog for updates on our latest technical breakthroughs and performance optimizations.*

**Technical References**:
- [Unreal Engine 5 Mass Entity Documentation](https://docs.unrealengine.com/5.0/en-US/mass-entity-in-unreal-engine/)
- [Hierarchical Instanced Static Meshes Guide](https://docs.unrealengine.com/5.0/en-US/instanced-static-mesh-component-in-unreal-engine/)
- [Nanite Virtualized Geometry](https://docs.unrealengine.com/5.0/en-US/nanite-virtualized-geometry-in-unreal-engine/)
- [FFastArraySerializer Documentation](https://docs.unrealengine.com/4.27/en-US/ProgrammingAndScripting/Networking/Actors/FastArrays/)
- [Asynchronous Physics Cooking](https://docs.unrealengine.com/5.0/en-US/physics-cooking-in-unreal-engine/)

**Performance Benchmarks**:
- Target: 100,000+ parts per ship
- Rendering: 60+ FPS on RTX 3070 equivalent
- Networking: 64 concurrent players
- Memory: <8GB RAM per client
- Physics: <16ms collision rebuild time