import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ivory px-6 text-center">
      <Link href="/" className="relative block h-12 w-[190px]"><Image src="/brand/logo.svg" alt="MR.HOME" fill className="object-contain" unoptimized /></Link>
      <p className="eyebrow mt-10">404</p>
      <h1 className="display mt-4 text-[clamp(2rem,5vw,3.6rem)] text-ink">This address doesn’t exist.</h1>
      <p className="mt-4 max-w-md text-[15px] text-charcoal/75">The page you’re looking for may have moved or been unpublished. Let’s get you back to the portfolio.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex h-12 items-center rounded-full bg-brand px-6 text-[14px] font-medium text-white shadow-glow transition hover:bg-brand-deep">Back to Home</Link>
        <Link href="/projects" className="inline-flex h-12 items-center rounded-full border border-ink/10 bg-white px-6 text-[14px] font-medium text-ink transition hover:border-brand">Explore Projects</Link>
        <Link href="/markets" className="inline-flex h-12 items-center rounded-full border border-ink/10 bg-white px-6 text-[14px] font-medium text-ink transition hover:border-brand">Explore Markets</Link>
      </div>
    </div>
  );
}
