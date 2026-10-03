type Page<T> = { data: T[] | null; error: unknown };

// Advance by the received count: a project's API cap may be lower than our page size.
export async function readAllPages<T>(readPage: (from: number, to: number) => PromiseLike<Page<T>>, pageSize = 500): Promise<T[]> {
  const result: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await readPage(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) return result;
    result.push(...data);
    offset += data.length;
  }
}
