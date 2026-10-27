import type { Metadata } from "next";
import { IBM_Plex_Sans, Montserrat, Righteous } from "next/font/google";
import "./globals.css";

// Headings use Montserrat, the title uses Righteous, and everything else uses IBM Plex Sans.
const display = Montserrat({ subsets: ["latin"], variable: "--font-display" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const title = Righteous({ subsets: ["latin"], weight: "400", variable: "--font-title" });

export const metadata: Metadata = {
  title: "DailyLevelUp",
  description: "Hierarchical daily task planner with progress tracking",
};

// Applies a saved light/dark choice before first paint so the page doesn't flash the wrong theme.
const themeScript = `try{var t=localStorage.getItem('dailylevelup.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${title.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
