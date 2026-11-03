export function PageHeading({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return <header className="f-page-heading"><h1>{title}</h1>{actions}</header>;
}
