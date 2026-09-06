import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type Turn = {
  role: "user" | "assistant";
  text: string;
  time: string;
};

export type TranscriptProps = {
  turns: Turn[];
  isBusy?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
  className?: string;
};

export function Transcript({
  turns,
  isBusy = false,
  emptyTitle = "Start a live interruption test",
  emptySubtitle = "Try the scenarios below or speak your own.",
  className,
}: TranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [turns, isBusy]);

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-label="Conversation transcript"
      className={cn(
        "flex max-h-[420px] min-h-[300px] flex-col gap-3 overflow-y-auto pr-1 scroll-smooth",
        className,
      )}
    >
      {turns.length === 0 && (
        <div className="m-auto py-8 text-center">
          <Sparkles className="mx-auto mb-3 size-7 animate-pulse text-brand-violet" />
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{emptySubtitle}</p>
        </div>
      )}

      <AnimatePresence initial={false}>
        {turns.map((turn, index) => {
          const isUser = turn.role === "user";
          return (
            <motion.div
              key={`${turn.role}-${turn.time}-${index}`}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={cn(
                "max-w-[88%] rounded-2xl border p-4 shadow-sm transition-colors",
                isUser
                  ? "ml-auto border-primary/30 bg-primary/10 text-foreground"
                  : "border-border bg-card/70 text-foreground backdrop-blur-sm",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between gap-5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {isUser ? (
                    <>
                      <User className="size-3 text-brand-violet" />
                      <span>You</span>
                    </>
                  ) : (
                    <>
                      <Bot className="size-3 text-brand-cyan" />
                      <span className="text-foreground/90">Vaani</span>
                    </>
                  )}
                </span>
                <span className="font-mono text-[11px] opacity-75">{turn.time}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{turn.text}</p>
            </motion.div>
          );
        })}

        {isBusy && (
          <motion.div
            key="transcript-typing-indicator"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mr-auto flex items-center gap-2 rounded-2xl border border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground"
          >
            <Bot className="size-3.5 animate-pulse text-brand-cyan" />
            <span className="inline-flex items-center gap-1">
              Vaani is thinking
              <span className="ml-1 inline-flex gap-0.5">
                <span className="size-1 animate-bounce rounded-full bg-brand-cyan [animation-delay:-0.3s]" />
                <span className="size-1 animate-bounce rounded-full bg-brand-cyan [animation-delay:-0.15s]" />
                <span className="size-1 animate-bounce rounded-full bg-brand-cyan" />
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Transcript;
