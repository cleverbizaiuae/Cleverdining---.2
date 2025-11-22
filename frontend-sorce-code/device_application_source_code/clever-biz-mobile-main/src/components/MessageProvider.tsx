// MessageContext.tsx
import { createContext, useState, useContext, ReactNode } from "react";

type Message = {
  id: number;
  is_from_device: boolean;
  text: string;
};

interface MessageContextType {
  messages: Message[];
  newMessage: boolean;
  addMessage: (message: Message) => void;
  markAsRead: () => void;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export const MessageProvider = ({ children }: { children: ReactNode }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<boolean>(false);

  const addMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
    setNewMessage(true); // Trigger new message notification
  };

  const markAsRead = () => {
    setNewMessage(false); // Mark the new message as read
  };

  return (
    <MessageContext.Provider
      value={{ messages, newMessage, addMessage, markAsRead }}
    >
      {children}
    </MessageContext.Provider>
  );
};

export const useMessage = () => {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error("useMessage must be used within MessageProvider");
  }
  return context;
};
