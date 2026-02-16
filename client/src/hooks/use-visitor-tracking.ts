import { useEffect, useRef } from "react";

function getVisitorId(): string {
  let id = localStorage.getItem('abib_visitor_id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('abib_visitor_id', id);
  }
  return id;
}

export function useVisitorTracking(page: string) {
  const lastPage = useRef<string>('');

  useEffect(() => {
    if (lastPage.current === page) return;
    lastPage.current = page;

    const visitorId = getVisitorId();
    fetch('/api/track-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, page }),
    }).catch(() => {});
  }, [page]);
}

export function useGlobalVisitorTracking() {
  useEffect(() => {
    const visitorId = getVisitorId();
    const page = window.location.pathname;
    fetch('/api/track-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, page }),
    }).catch(() => {});
  }, []);
}
