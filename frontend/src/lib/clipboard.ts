/**
 * 独立的剪贴板工具。
 *
 * 之所以不放在 lib/markdown.ts：后者会拉起 highlight.js / marked 等重依赖，
 * 而只需复制功能的轻组件（如 about 页社交区）若从中导入，
 * 会把整条 markdown 渲染链拖进客户端 bundle。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 降级使用 execCommand
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  }

  return false;
}
