import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import type { Citation, Message } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface MessageBubbleProps {
	message: Message;
	onCitationClick: (citation: Citation) => void;
	activeCitationId: string | null;
}

export function MessageBubble({
	message,
	onCitationClick,
	activeCitationId,
}: MessageBubbleProps) {
	if (message.role === "system") {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
				className="flex justify-center py-2"
			>
				<p className="text-xs text-neutral-400">{message.content}</p>
			</motion.div>
		);
	}

	if (message.role === "user") {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="flex justify-end py-1.5"
			>
				<div className="max-w-[75%] rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5">
					<p className="whitespace-pre-wrap text-sm text-neutral-800">
						{message.content}
					</p>
				</div>
			</motion.div>
		);
	}

	// Assistant message
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="flex gap-3 py-1.5"
		>
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				<div className="prose">
					<Streamdown>{message.content}</Streamdown>
				</div>
				{message.citations.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1.5">
						{message.citations.map((citation) => {
							const quote = citation.cited_text.replace(/\s+/g, " ").trim();
							return (
								<Tooltip key={citation.id}>
									<TooltipTrigger asChild>
										<button
											type="button"
											className={`rounded-md border px-2 py-0.5 text-xs text-neutral-600 ${
												citation.id === activeCitationId
													? "border-neutral-400 bg-neutral-200"
													: "border-neutral-200 bg-neutral-50 hover:bg-neutral-100"
											}`}
											onClick={() => onCitationClick(citation)}
										>
											[{citation.ordinal}] p.{citation.page_number}{" "}
											{quote.length > 60 ? `${quote.slice(0, 60)}…` : quote}
										</button>
									</TooltipTrigger>
									<TooltipContent className="max-h-72 max-w-md overflow-y-auto border border-neutral-200 bg-white py-2 text-neutral-700 shadow-md">
										<Quote text={citation.cited_text} />
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>
				)}
			</div>
		</motion.div>
	);
}

interface StreamingBubbleProps {
	content: string;
}

export function StreamingBubble({ content }: StreamingBubbleProps) {
	return (
		<div className="flex gap-3 py-1.5">
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				{content ? (
					<div className="prose">
						<Streamdown mode="streaming">{content}</Streamdown>
					</div>
				) : (
					<div className="flex items-center gap-1 py-2">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.15s" }}
						/>
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.3s" }}
						/>
					</div>
				)}
				<span className="inline-block h-4 w-0.5 animate-pulse bg-neutral-400" />
			</div>
		</div>
	);
}

// A cited passage, one line per clause as the server split it, with its number or defined term in bold
function Quote({ text }: { text: string }) {
	return (
		<>
			{text
				.trim()
				.split("\n")
				.reduce<string[]>((lines, line) => {
					// A line starting with a lowercase letter continues the previous one across a page break
					if (lines.length && /^[a-z]/.test(line))
						lines[lines.length - 1] += ` ${line}`;
					else lines.push(line);
					return lines;
				}, [])
				.map((line, i) => {
					const head = line.startsWith('"')
						? line.slice(0, line.indexOf('"', 1) + 1)
						: (line.split(" ")[0] ?? "");
					return (
						<p key={line} className={i > 0 ? "mt-2" : ""}>
							{/^[\d("]/.test(head) ? <strong>{head}</strong> : head}
							{line.slice(head.length)}
						</p>
					);
				})}
		</>
	);
}
