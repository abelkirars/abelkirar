"use client";

import { useState } from "react";

export default function UploadInstrumentImages() {
  const [files, setFiles] = useState<{ [key: string]: File }>({});
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState("variants");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const fieldName = e.target.name;
    if (file) {
      setFiles((prev) => ({ ...prev, [fieldName]: file }));
    }
  };

  const handleVariantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    const formData = new FormData();
    formData.append("desaleg", files.desaleg);
    formData.append("gash", files.gash);

    try {
      const response = await fetch("/api/admin/setup-kirar-variants", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: String(error) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Upload Kirar Variants</h1>

      <div style={{ marginBottom: "20px", borderBottom: "1px solid #ccc" }}>
        <button
          onClick={() => setActiveTab("variants")}
          style={{
            padding: "10px 20px",
            marginRight: "10px",
            fontWeight: activeTab === "variants" ? "bold" : "normal",
          }}
        >
          Kirar Variants
        </button>
      </div>

      {activeTab === "variants" && (
        <form onSubmit={handleVariantSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label>
              Desaleg Kirar Image:
              <input
                type="file"
                name="desaleg"
                accept="image/*"
                onChange={handleFileChange}
                required
              />
            </label>
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label>
              Gash Tesfay Kirar Image:
              <input
                type="file"
                name="gash"
                accept="image/*"
                onChange={handleFileChange}
                required
              />
            </label>
          </div>
          <button type="submit" disabled={uploading}>
            {uploading ? "Uploading..." : "Upload Kirar Variants"}
          </button>
        </form>
      )}

      {result && (
        <div style={{ marginTop: "20px", padding: "10px", background: "#f0f0f0" }}>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
