import { useEffect, useState } from "react";
import { apiGet } from "../api/client";

export default function Support() {
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);

  useEffect(() => {
    apiGet<{ links: { label: string; url: string }[] }>("/api/support").then((d) =>
      setLinks(d.links || []),
    );
  }, []);

  return (
    <div className="page-enter">
      <h1 className="page-title-gradient" style={{ marginTop: 0 }}>
        Hỗ trợ
      </h1>
      <ul style={{ lineHeight: 2 }}>
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
