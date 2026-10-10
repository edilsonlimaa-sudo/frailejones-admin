import type { PostgrestError } from "@supabase/supabase-js";

type Pagina<T> = { data: T[] | null; error: PostgrestError | null; count: number | null };

// A API do Supabase devolve no máximo max_rows linhas por consulta (1000 no projeto) e corta o
// resto sem erro. Para consultas que podem passar disso, busca página a página com .range() até
// juntar todas. A consulta precisa:
//   - pedir a contagem: .select("...", { count: "exact" }) — é ela que diz quando parar, então o
//     loop funciona mesmo se o servidor tiver um max_rows menor que o tamanho da página;
//   - ter ordenação estável (terminar em .order("id")), senão as páginas podem repetir ou pular linhas.
// Enquanto houver menos linhas que uma página, é uma única chamada, como uma consulta normal.
export async function buscarTodas<T>(
  buscarPagina: (de: number, ate: number) => PromiseLike<Pagina<T>>,
  tamanhoPagina = 1000,
): Promise<{ data: T[]; error: null } | { data: null; error: PostgrestError }> {
  const linhas: T[] = [];
  for (;;) {
    const { data, error, count } = await buscarPagina(linhas.length, linhas.length + tamanhoPagina - 1);
    if (error) return { data: null, error };

    const pagina = data ?? [];
    linhas.push(...pagina);

    // sem contagem (consulta sem count: "exact"), para quando a página vier incompleta
    const terminou =
      pagina.length === 0 || (count !== null ? linhas.length >= count : pagina.length < tamanhoPagina);
    if (terminou) return { data: linhas, error: null };
  }
}
