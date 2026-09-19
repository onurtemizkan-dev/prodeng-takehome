import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import type { Document } from "../types";
import { Button } from "./ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_WIDTH = 280;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 400;

interface DocumentViewerProps {
	document: Document | null;
	page: number;
	highlight: string;
	onPageChange: (page: number) => void;
}

export function DocumentViewer({
	document,
	page,
	highlight,
	onPageChange,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setDragging(true);

			const startX = e.clientX;
			const startWidth = width;

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const delta = startX - moveEvent.clientX;
				const newWidth = Math.min(
					MAX_WIDTH,
					Math.max(MIN_WIDTH, startWidth + delta),
				);
				setWidth(newWidth);
			};

			const handleMouseUp = () => {
				setDragging(false);
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[width],
	);

	const pdfPageWidth = width - 48; // account for px-4 padding on each side

	// The page's text layer items, and which of them are part of the cited passage
	const [items, setItems] = useState<string[]>([]);
	const marked = useMemo(
		() => markedItems(items, highlight),
		[items, highlight],
	);
	const renderText = useCallback(
		({ str, itemIndex }: { str: string; itemIndex: number }) => {
			const text = escapeHtml(str); // the renderer's output is HTML
			return marked.has(itemIndex)
				? `<mark class="bg-yellow-300/50 text-transparent">${text}</mark>`
				: text;
		},
		[marked],
	);

	if (!document) {
		return (
			<div
				style={{ width }}
				className="flex h-full flex-shrink-0 flex-col items-center justify-center border-l border-neutral-200 bg-neutral-50"
			>
				<FileText className="mb-3 h-10 w-10 text-neutral-300" />
				<p className="text-sm text-neutral-400">No document uploaded</p>
			</div>
		);
	}

	const pdfUrl = getDocumentUrl(document.id);

	return (
		<div
			ref={containerRef}
			style={{ width }}
			className="relative flex h-full flex-shrink-0 flex-col border-l border-neutral-200 bg-white"
		>
			{/* Resize handle */}
			<div
				className={`absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-neutral-300 ${
					dragging ? "bg-neutral-400" : ""
				}`}
				onMouseDown={handleMouseDown}
			/>

			{/* Header */}
			<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-neutral-800">
						{document.filename}
					</p>
					<p className="text-xs text-neutral-400">
						{document.page_count} page{document.page_count !== 1 ? "s" : ""}
					</p>
				</div>
			</div>

			{/* PDF content */}
			<div className="flex-1 overflow-y-auto p-4">
				{pdfError && (
					<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
						{pdfError}
					</div>
				)}

				<PDFDocument
					file={pdfUrl}
					onLoadSuccess={({ numPages: pages }) => {
						setNumPages(pages);
						setPdfLoading(false);
						setPdfError(null);
					}}
					onLoadError={(error) => {
						setPdfError(`Failed to load PDF: ${error.message}`);
						setPdfLoading(false);
					}}
					loading={
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
						</div>
					}
				>
					{!pdfLoading && !pdfError && (
						<Page
							pageNumber={page}
							width={pdfPageWidth}
							customTextRenderer={renderText}
							onGetTextSuccess={({ items }) =>
								setItems(items.map((item) => ("str" in item ? item.str : "")))
							}
							loading={
								<div className="flex items-center justify-center py-12">
									<Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
								</div>
							}
						/>
					)}
				</PDFDocument>
			</div>

			{/* Page navigation */}
			{numPages > 0 && (
				<div className="flex items-center justify-center gap-3 border-t border-neutral-100 px-4 py-2.5">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={page <= 1}
						onClick={() => onPageChange(Math.max(1, page - 1))}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs text-neutral-500">
						Page {page} of {numPages}
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={page >= numPages}
						onClick={() => onPageChange(Math.min(numPages, page + 1))}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}
		</div>
	);
}

// Indexes of the text layer items that overlap a block of the cited passage. Both sides are
// reduced to letters and digits first, so hyphenation and where pdf.js splits the text don't matter.
function markedItems(items: string[], passage: string): Set<number> {
	const lengths = items.map((item) => squeeze(item).length);
	const pageText = items.map(squeeze).join("");
	const marked = new Set<number>();
	for (const block of passage.split("\n").map(squeeze)) {
		const from = block ? pageText.indexOf(block) : -1;
		if (from < 0) continue;
		const to = from + block.length;
		let start = 0;
		for (let index = 0; index < lengths.length; index++) {
			const end = start + (lengths[index] ?? 0);
			if (start < to && end > from) marked.add(index);
			start = end;
		}
	}
	return marked;
}

function squeeze(text: string) {
	return text.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
}

function escapeHtml(text: string) {
	return text.replace(
		/[&<>]/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c,
	);
}
