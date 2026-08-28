"use client";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  baseUrl: string;
  params: Record<string, string | undefined>;
}

export default function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  baseUrl,
  params,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;

  const createUrl = (page: number) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.set(key, value);
    });
    if (page > 1) searchParams.set("page", String(page));
    return `${baseUrl}?${searchParams.toString()}`;
  };

  const pages = [];
  const maxVisiblePages = 9;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = startPage + maxVisiblePages - 1;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-center gap-2" aria-label="Paginação dos resultados">
      <a
        href={createUrl(currentPage - 1)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          currentPage === 1
            ? "text-slate-300 cursor-not-allowed"
            : "text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
        }`}
        aria-disabled={currentPage === 1}
        aria-label="Página anterior"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Anterior
      </a>
      {startPage > 1 && (
        <>
          <a href={createUrl(1)} className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50">1</a>
          {startPage > 2 && <span className="inline-flex items-center px-2 text-sm text-slate-400">…</span>}
        </>
      )}
      {pages.map((p) => (
        <a
          key={p}
          href={createUrl(p)}
          className={`inline-flex items-center justify-center min-w-[2.5rem] rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            p === currentPage
              ? "bg-indigo-600 text-white"
              : "text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
          }`}
          aria-current={p === currentPage ? "page" : undefined}
        >
          {p}
        </a>
      ))}
      {endPage < totalPages && (
        <>
          {endPage < totalPages - 1 && <span className="inline-flex items-center px-2 text-sm text-slate-400">…</span>}
          <a href={createUrl(totalPages)} className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50">{totalPages}</a>
        </>
      )}
      <a
        href={createUrl(currentPage + 1)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          currentPage === totalPages
            ? "text-slate-300 cursor-not-allowed"
            : "text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
        }`}
        aria-disabled={currentPage === totalPages}
        aria-label="Próxima página"
      >
        Próxima
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </a>
      <div className="ml-2 flex items-center gap-1.5">
        <label htmlFor="page-jump" className="text-xs text-slate-500">Ir para:</label>
        <input
          type="number"
          id="page-jump"
          min="1"
          max={totalPages}
          defaultValue={currentPage}
          onChange={(e) => {
            const page = Math.min(Math.max(1, parseInt(e.target.value) || 1), totalPages);
            if (page !== currentPage) window.location.href = createUrl(page);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const page = Math.min(Math.max(1, parseInt(e.currentTarget.value) || 1), totalPages);
              if (page !== currentPage) window.location.href = createUrl(page);
            }
          }}
          className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-center text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          aria-label="Pular para página"
        />
        <span className="text-xs text-slate-400">de {totalPages}</span>
      </div>
    </nav>
  );
}