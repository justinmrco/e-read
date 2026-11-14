import Link from 'next/link';
export default function ReadBookPage() {
  return <main className="page-arrival page-shell min-h-screen bg-neutral-900 text-white p-6">
    <Link href="/" className="text-yellow-300 underline">Back to catalog</Link>
    <h1 className="text-4xl sm:text-5xl mt-6 mb-3">Shared sample reader</h1>
    <p className="max-w-2xl mb-6 text-neutral-300">This public sample demonstrates a reading interface. It is the same for every title and is not a purchased book or protected file.</p>
    <article className="reader mx-auto bg-neutral-800 p-6 sm:p-10 rounded-sm leading-loose">
      <h2 className="text-2xl text-yellow-300 mb-4">A Small Library</h2>
      <p>The first shelf held only three books. One described a city that had never existed; another followed a traveler who always took the long road. The third was blank.</p>
      <p className="mt-4">Each afternoon, a visitor stopped beside the empty book and imagined a different beginning. Before long, the smallest library in town had more stories than shelves.</p>
      <p className="text-sm text-neutral-300 mt-8">Original fictional sample created for this E-Read demo. No commercial book text is included.</p>
    </article>
  </main>;
}
