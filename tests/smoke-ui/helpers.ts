import type { Page } from "@playwright/test";

export async function focusTerminal(page: Page) {
  const textarea = page.locator("textarea.xterm-helper-textarea");
  await textarea.waitFor({ state: "visible" });
  await textarea.click();
}

export async function runTerminalCommand(page: Page, command: string) {
  await focusTerminal(page);
  await page.keyboard.type(command, { delay: 12 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(420);
}

export async function terminalText(page: Page): Promise<string> {
  return (await page.locator(".xterm-screen").innerText()) ?? "";
}

export async function waitForTerminalText(page: Page, pattern: RegExp) {
  await page.waitForFunction(
    (reSource) => {
      const el = document.querySelector(".xterm-screen");
      const text = el?.textContent ?? "";
      return new RegExp(reSource).test(text);
    },
    pattern.source,
    { timeout: 15_000 },
  );
}
