import { useCallback, useRef, useState } from 'react';
import type { NamedFile } from '../lib/parse';

/** Reads a file as text, falling back to FileReader where Blob.text is absent. */
async function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}

/**
 * Drop target for the Music League export. Files are read locally with
 * FileReader — nothing is uploaded anywhere.
 */
export function FileDrop({
  onFiles,
  onDemo,
  error,
}: {
  onFiles: (files: NamedFile[]) => void;
  onDemo: () => void;
  error?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ingest = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const files = [...fileList].filter((f) => /\.(csv|txt)$/i.test(f.name));
      const named = await Promise.all(
        files.map(async (f) => ({ name: f.name, text: await readText(f) })),
      );
      if (named.length) onFiles(named);
    },
    [onFiles],
  );

  return (
    <div className="landing">
      <div className="landing__inner">
        <h1>
          Music League <span>Dashboard</span>
        </h1>
        <p className="landing__lede">
          Drop your league export in and get the full picture: who votes for whom, who gets
          frozen out, who forfeits points by not voting, and how the standings actually moved.
        </p>

        <div
          className={`drop${dragging ? ' drop--active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void ingest(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          aria-label="Choose or drop Music League CSV export files"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt"
            multiple
            hidden
            onChange={(e) => void ingest(e.target.files)}
          />
          <strong>Drop your export CSV here</strong>
          <span>or click to choose a file</span>
        </div>

        {error && <p className="alert alert--bad">{error}</p>}

        <button className="ghost-btn" onClick={onDemo}>
          Explore with a sample league instead
        </button>

        <div className="landing__help">
          <h3>Getting your export</h3>
          <ol>
            <li>
              Open your league on Music League, then use <em>Export Data</em> from the league
              menu (or the export button on the Standings tab). It is a Premium feature.
            </li>
            <li>
              You get one CSV containing <code>[rounds]</code>, <code>[submissions]</code>,{' '}
              <code>[votes]</code>, <code>[comments]</code> and <code>[standings]</code>.
            </li>
            <li>Drop it above. Older multi-file exports work too — select all the CSVs at once.</li>
          </ol>
          <p className="landing__privacy">
            Everything is parsed in your browser. No server, no upload, nothing sent anywhere.
          </p>
        </div>
      </div>
    </div>
  );
}
