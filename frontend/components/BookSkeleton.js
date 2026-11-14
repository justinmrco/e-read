export default function BookSkeleton() {
  return <div role="status"><span className="sr-only">Loading books...</span><div className="catalog-grid" aria-hidden="true">{Array.from({ length:4 }, (_,index) => <div key={index}><div className="skeleton aspect-[2/3] rounded" /><div className="skeleton h-3 w-1/3 mt-4" /><div className="skeleton h-5 w-4/5 mt-3" /><div className="skeleton h-3 w-1/2 mt-3" /></div>)}</div></div>;
}
