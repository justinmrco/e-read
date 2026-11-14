"use client";

import { useSortable } from "@dnd-kit/sortable";
import BookCard from "./BookCard";

export default function SortableBookCard({ book, disabled, onEdit }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: book._id, disabled });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scaleX}, ${transform.scaleY})` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="min-w-0"
    >
      <BookCard book={book} />
      <div className="flex justify-between gap-3 mt-2">
        <button type="button" disabled={disabled} onClick={onEdit} aria-label={'Edit ' + book.title} className="text-yellow-300 px-3 py-2 disabled:opacity-50">Edit book</button>
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled} aria-label={'Reorder ' + book.title} className="cursor-grab active:cursor-grabbing touch-none px-3 py-2 rounded bg-neutral-800 disabled:opacity-50">Reorder</button>
      </div>
    </div>
  );
}
