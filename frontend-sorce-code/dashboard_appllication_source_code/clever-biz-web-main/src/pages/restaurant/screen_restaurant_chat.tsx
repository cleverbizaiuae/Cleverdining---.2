import { ChatSection } from "@/components/utilities";
import { useContext, useEffect } from "react";
import { WebSocketContext } from "@/hooks/WebSocketProvider";

const ScreenRestaurantChat = () => {
  const { setUnreadCount } = useContext(WebSocketContext) || {};

  useEffect(() => {
    if (setUnreadCount) {
      setUnreadCount(0);
    }
  }, [setUnreadCount]);

  return <ChatSection />;
};

export default ScreenRestaurantChat;