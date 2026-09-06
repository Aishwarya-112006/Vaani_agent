import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";

export function SiteHeader({ tagline }: { tagline: string }) {
  return (
    <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-border py-5">
      <Link to="/" className="group flex items-center gap-3">
        <motion.div
          whileHover={{ rotate: 8, scale: 1.08 }}
          transition={{ type: "spring", stiffness: 320, damping: 16 }}
          className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-xl font-black text-primary-foreground shadow-[0_0_35px_oklch(0.53_0.24_294/0.4)]"
        >
          V
        </motion.div>
        <div>
          <div className="font-semibold tracking-tight">VaaniAgent</div>
          <div className="text-xs text-muted-foreground">{tagline}</div>
        </div>
      </Link>

      <nav className="flex gap-1 rounded-full border border-border bg-card/60 p-1 text-sm backdrop-blur-md">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-primary text-primary-foreground" }}
          inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
          className="rounded-full px-4 py-2 transition-colors"
        >
          Voice lab
        </Link>
        <Link
          to="/evaluate"
          activeProps={{ className: "bg-primary text-primary-foreground" }}
          inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
          className="rounded-full px-4 py-2 transition-colors"
        >
          Evaluation
        </Link>
      </nav>

      <div className="hidden items-center gap-2 text-xs md:flex">
        <span className="status-pill">
          <span className="size-1.5 rounded-full bg-brand-lime" />
          Live sandbox
        </span>
        <span className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">
          Rime TTS
        </span>
      </div>
    </header>
  );
}
