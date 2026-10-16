export function shouldShowRatePrompt(tourWasUnseenAtLoad: boolean, tourOpen: boolean): boolean {
  return !tourWasUnseenAtLoad && !tourOpen;
}
