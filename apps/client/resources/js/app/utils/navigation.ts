/**
 * Provides the public auction history navigation helper.
 */
/**
 * Navigates the public auction demo with browser history.
 */
export function navigateTo(path: string) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}
