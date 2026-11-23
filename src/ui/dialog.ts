import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

/**
 * Drop-in replacement for React Native's Alert that also works in the web app.
 * (On web, React Native's Alert silently does nothing — confirmations and error
 * messages would never appear.) On iPhone native it uses the real iOS dialog;
 * on web it uses the browser's own confirm/alert dialogs.
 */
function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    NativeAlert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const cancel = buttons?.find((b) => b.style === 'cancel');
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (!actions.length) {
    window.alert(text);
    cancel?.onPress?.();
    return;
  }
  if (actions.length === 1) {
    if (window.confirm(`${text}\n\nOK = ${actions[0].text}`)) actions[0].onPress?.();
    else cancel?.onPress?.();
    return;
  }
  for (const a of actions) {
    if (window.confirm(`${text}\n\n${a.text}?`)) {
      a.onPress?.();
      return;
    }
  }
  cancel?.onPress?.();
}

export const Alert = { alert };
