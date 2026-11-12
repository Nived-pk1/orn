/** Test helpers for the exam chip (step 8.4f, L1): a menu button named "Exam: <exam>"; Enter opens its menu of radio items. */
import { fireEvent, screen, within } from "@testing-library/react";

export const examChip = (): HTMLElement =>
  screen.getByRole("button", { name: /^Exam: / });
export const examChipText = (): string => examChip().textContent ?? "";

export function openExamMenu(): HTMLElement {
  const trigger = examChip();
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("menu");
}

export const examChoices = (): string[] =>
  within(openExamMenu())
    .getAllByRole("menuitemradio")
    .map((item) => item.textContent ?? "");

export function chooseExam(label: string): void {
  openExamMenu();
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}
