// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MockBadge } from "./badges";

afterEach(cleanup);

describe("MockBadge", () => {
  it("labels content from the mock provider as test content", () => {
    const { container } = render(<MockBadge provider="mock" />);
    expect(container.textContent).toBe("Conținut de test (mock)");
  });

  it("shows nothing for a real provider or when the provider is unknown", () => {
    const { container } = render(
      <>
        <MockBadge provider="gemini" />
        <MockBadge provider={undefined} />
      </>,
    );
    expect(container.textContent).toBe("");
  });
});
