import { useCallback, useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  accept: string;
  label: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

const FileUpload = ({ accept, label, file, onFileChange, disabled }: FileUploadProps) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const f = e.dataTransfer.files[0];
      if (f) onFileChange(f);
    },
    [disabled, onFileChange]
  );

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {file ? (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border">
          <FileText className="w-5 h-5 text-primary" />
          <span className="text-sm flex-1 truncate">{file.name}</span>
          {!disabled && (
            <button onClick={() => onFileChange(null)} className="text-muted-foreground hover:text-destructive transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
            disabled ? "opacity-50 cursor-not-allowed border-border" : "cursor-pointer",
            !disabled && (dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")
          )}
          onClick={() => {
            if (disabled) return;
            const input = document.createElement("input");
            input.type = "file";
            input.accept = accept;
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) onFileChange(f);
            };
            input.click();
          }}
        >
          <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Drop file here or <span className="text-primary font-medium">browse</span>
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">{accept}</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
