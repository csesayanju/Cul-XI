/** Reading-width column on wide screens (the app shell itself is wider). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl">{children}</div>;
}
