// X DOM is not a stable API. Verify these against the authorized account.
export const X_SELECTORS = {
  accountMenu: '[data-testid="SideNav_AccountSwitcher_Button"]',
  forYouTab: { role: "tab", name: "For you", exact: true },
} as const;
