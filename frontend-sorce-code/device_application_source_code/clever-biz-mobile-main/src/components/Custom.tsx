import { useState, useEffect } from "react";

export const useNewMessage = (hasNewMessage: boolean) => {
  localStorage.setItem("newMessage", hasNewMessage.toString());
};

export const useGetNewMessage = () => {
  const [newMessage, setNewMessage] = useState(false);

  useEffect(() => {
    const checkNewMessage = () => {
      const newMessage = localStorage.getItem("newMessage");
      if (newMessage === "true") {
        setNewMessage(true);
      } else {
        setNewMessage(false);
      }
    };
    checkNewMessage();
    window.addEventListener("storage", checkNewMessage);
    return () => {
      window.removeEventListener("storage", checkNewMessage);
    };
  }, []);

  return newMessage;
};

export const clearNewMessage = () => {
  localStorage.setItem("newMessage", "false");
};

export const useClearNewMessage = () => {
  useEffect(() => {
    localStorage.setItem("newMessage", "false");
  }, []);
};
