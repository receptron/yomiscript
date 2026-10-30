// Inline styles, so the plugin needs no stylesheet from the host. Colors follow the host's text color.
import type { CSSProperties } from "vue";

export const styles: Record<string, CSSProperties> = {
  card: { padding: "16px", lineHeight: 1.7, fontSize: "18px", maxWidth: "48rem" },
  text: { margin: "0 0 12px" },
  current: { background: "rgba(255, 200, 0, 0.45)", borderRadius: "3px" },
  controls: { display: "flex", alignItems: "center", gap: "12px", fontSize: "14px" },
  button: {
    font: "inherit",
    padding: "4px 14px",
    borderRadius: "6px",
    border: "1px solid currentColor",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
  },
  status: { opacity: 0.7 },
  details: { marginTop: "12px", fontSize: "13px", opacity: 0.8 },
  code: { display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "ui-monospace, monospace", marginTop: "6px" },
  preview: { fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
};
