import { OwnerProvider } from "@/context/ownerContext";
import { StaffProvider } from "@/context/staffContext";
import WebSocketProvider from "@/hooks/WebSocketProvider";
import RestaurantLayout from "./layout";

const RestaurantRuntime = () => (
  <WebSocketProvider>
    <OwnerProvider>
      <StaffProvider>
        <RestaurantLayout />
      </StaffProvider>
    </OwnerProvider>
  </WebSocketProvider>
);

export default RestaurantRuntime;
