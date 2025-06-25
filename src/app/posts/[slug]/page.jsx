import { getBlogSlugs, getBlogBySlug } from '../../../utils/markdown';
import Markdown from '../../../components/Markdown';
import { formatDate } from '../../../utils/date-formatter';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// This function gets called at build time to generate static paths
export async function generateStaticParams() {
  try {
    const slugs = await getBlogSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch (error) {
    console.error('Error generating static params:', error);
    return [];
  }
}

// This function generates metadata for the page
export async function generateMetadata({ params }) {
  try {
    // Always await params in Next.js App Router
    const awaitedParams = await params;
    const { slug } = awaitedParams;
    const blog = await getBlogBySlug(slug);
    
    if (!blog) {
      return {
        title: 'Post Not Found',
        description: 'The requested blog post could not be found.'
      };
    }
    
    return {
      title: blog.title,
      description: blog.excerpt || (blog.content ? blog.content.slice(0, 150) + '...' : 'No description available'),
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Error',
      description: 'There was an error loading this post'
    };
  }
}

// The main blog page component
export default async function BlogPage({ params }) {
  try {
    // Always await params in Next.js App Router
    const awaitedParams = await params;
    const { slug } = awaitedParams;
    const blog = await getBlogBySlug(slug);
    
    if (!blog) {
      // Use Next.js notFound function to show 404 page
      notFound();
    }
    
    // Calculate reading time if not already provided
    const readingTime = blog.readingTime || 
      (blog.content ? Math.ceil(blog.content.split(/\s+/).length / 200) : 1);
    
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline mb-8 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold mt-4 mb-2">{blog.title}</h1>
          
          <div className="flex items-center text-gray-600 dark:text-gray-400 mb-4">
            <span className="mr-4">{formatDate(blog.date)}</span>
            <span>{readingTime} min read</span>
          </div>
          
          {blog.tags && blog.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {blog.tags.map(tag => (
                <Link 
                  key={tag} 
                  href={`/tags/${tag}`}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-sm"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </div>

        <article className="prose prose-lg max-w-none dark:prose-invert">
          <Markdown content={blog.content} />
        </article>
      </div>
    );
  } catch (error) {
    console.error('Error rendering blog post:', error);
    // Handle any errors gracefully
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h1 className="text-3xl font-bold text-red-600 mb-4">Error Loading Post</h1>
        <p className="mb-6">Sorry, we couldn't load this blog post. Please try again later.</p>
        <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Return to Home
        </Link>
      </div>
    );
  }
}