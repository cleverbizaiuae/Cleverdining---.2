export const setNewMessage = (hasNewMessage: boolean) => {
  localStorage.setItem("newMessage", hasNewMessage.toString());
  // Dispatch a custom event to notify other components
  window.dispatchEvent(
    new CustomEvent("newMessageUpdate", {
      detail: { hasNewMessage },
    })
  );
};

export const getNewMessage = (): boolean => {
  const newMessage = localStorage.getItem("newMessage");
  return newMessage === "true";
};

export const clearNotification = () => {
  localStorage.setItem("newMessage", "false");
  // Dispatch a custom event to notify other components
  window.dispatchEvent(
    new CustomEvent("newMessageUpdate", {
      detail: { hasNewMessage: false },
    })
  );
};

export const markAsRead = () => {
  localStorage.setItem("newMessage", "false");
  // Dispatch a custom event to notify other components
  window.dispatchEvent(
    new CustomEvent("newMessageUpdate", {
      detail: { hasNewMessage: false },
    })
  );
};
