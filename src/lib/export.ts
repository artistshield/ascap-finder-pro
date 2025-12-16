import { SavedIPI } from '@/hooks/useSavedIPIs';

export function exportToCSV(data: SavedIPI[]) {
  const headers = ['Name', 'IPI Number', 'Type', 'Date Saved'];
  const rows = data.map((item) => [
    item.name,
    item.ipi_number,
    item.type,
    new Date(item.created_at).toISOString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  downloadFile(csvContent, 'ascap-ipis.csv', 'text/csv');
}

export function exportToJSON(data: SavedIPI[]) {
  const exportData = data.map((item) => ({
    name: item.name,
    ipiNumber: item.ipi_number,
    type: item.type,
    dateSaved: item.created_at,
  }));

  const jsonContent = JSON.stringify(exportData, null, 2);
  downloadFile(jsonContent, 'ascap-ipis.json', 'application/json');
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
