import { AdminProvider } from "@/context/adminContext";
import AdminLayout from "./layout";

const AdminRuntime = () => (
  <AdminProvider>
    <AdminLayout />
  </AdminProvider>
);

export default AdminRuntime;
