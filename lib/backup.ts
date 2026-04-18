const BACKUP_KEYS = [
  "urbscan_contacts",
  "urbscan_tasks",
  "urbscan_pipeline",
  "urbscan_visited",
  "urbscan_notes",
  "urbscan_history",
  "urbscan_wa_templates",
  "urbscan_wa_last_template",
  "urbscan_sender_name",
  "urbscan_sender_company",
  "urbscan_theme",
];

export function exportBackup(): void {
  const data: Record<string, unknown> = {
    version: 1,
    exportedAt: new Date().toISOString(),
  };
  for (const key of BACKUP_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      try { data[key] = JSON.parse(val); } catch { data[key] = val; }
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `urbscan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importBackup(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as Record<string, unknown>;
        let count = 0;
        for (const key of BACKUP_KEYS) {
          if (key in data) {
            localStorage.setItem(key, JSON.stringify(data[key]));
            count++;
          }
        }
        resolve(count);
      } catch {
        reject(new Error("备份文件格式无效"));
      }
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
}
