import React, { useContext, useEffect, useState } from "react";
import { Trash } from "lucide-react"; // Icon for trash
import toast from "react-hot-toast";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { ImSpinner6 } from "react-icons/im";
import axiosInstance from "@/lib/axios";
import { WebSocketContext } from "@/hooks/WebSocketProvider";
// import axiosInstance from "@/lib/axios";
// import { DeleteFoodItemModal } from "./DeleteFoodItemModal"; // Import the modal component

const CategoriesTable = ({ categories, setCategories }) => {
  const { response } = useContext(WebSocketContext);
  const [isModalOpen, setIsModalOpen] = useState(false); // Modal open/close state
  const [categoryToDelete, setCategoryToDelete] = useState(null); // Selected category to delete
  const [isDeleting, setIsDeleting] = useState(false); // Deletion in progress state
  //   const [categoryToDelete, setCategoryToDelete] = useState(null);
  const openModal = (category) => {
    setCategoryToDelete(category); // Set the selected category
    setIsModalOpen(true); // Open the modal
  };

  const closeModal = () => {
    setIsModalOpen(false); // Close the modal
    setCategoryToDelete(null); // Clear the selected category
  };

  return (
    <div>
      <div className="overflow-x-auto bg-[#1e2a3a] h-full rounded-lg shadow-lg p-4 w-full">
        <h3 className="text-2xl font-bold mb-4 text-white">All Category</h3>
        <table className="min-w-full text-white">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-2 text-left text-gray-200">Category</th>
              <th className="p-2 text-right text-gray-200">Action</th>
            </tr>
          </thead>
          <tbody>
            {categories
              .filter((category) => !category.parent_category)
              .map((category) => (
                <tr
                  key={category.id}
                  className="border-b border-gray-700 hover:bg-[#2a3a4a] transition duration-300"
                >
                  <td className="p-2">{category.Category_name}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => openModal(category)} // Open modal with the selected category
                      className="text-red-500 hover:text-red-700 transition-colors duration-200"
                      disabled={isDeleting}
                    >
                      <Trash size={20} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Delete Food Item Modal */}
      {isModalOpen && (
        <DeleteFoodItemModal
          isOpen={isModalOpen} // Open the modal
          close={closeModal} // Function to close the modal
          id={categoryToDelete?.id}
          setCategories={setCategories} // Pass the category ID to the modal
        />
      )}
    </div>
  );
};

export default CategoriesTable;

const DeleteFoodItemModal = ({ isOpen, close, id, setCategories }) => {
  const { response } = useContext(WebSocketContext);
  const parseUser = JSON.parse(localStorage.getItem("userInfo"));
  const role = parseUser?.role;
  console.log(role);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!id) {
      toast.error("No item selected for deletion.");
      return;
    }

    setLoading(true);

    // Log the constructed URL to ensure it's correct
    const url = `/owners/categories/${id}/`;
    console.log("Delete URL:", url);

    try {
      const response = await axiosInstance.delete(url);
      console.log("Delete Response:", response);
      toast.success("Item deleted successfully!");
      setCategories((prevCategories) =>
        prevCategories.filter((category) => category.id !== id)
      );
      close();
    } catch (err) {
      console.error(
        "Failed to delete item",
        err.response ? err.response.data : err
      );
      toast.error("An error occurred while deleting the item.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (response === "category_deleted") {
      handleDelete();
    }
  }, [response]);

  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-10 focus:outline-none"
      onClose={close}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/20" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="w-full max-w-md rounded-xl bg-sidebar/80 p-6 backdrop-blur-2xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0"
          >
            <DialogTitle as="h3" className="text-base/7 font-medium text-white">
              Delete Category
            </DialogTitle>
            <p className="mt-2 text-sm/6 text-white/50">
              Are you sure you want to delete this Category? This action cannot
              be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                onClick={close}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="button-primary inline-flex items-center gap-2 rounded-md py-2 px-4 text-sm/6 font-semibold text-white shadow-inner shadow-white/5 focus:outline-none data-[hover]:bg-red-600 data-[focus]:outline-1 data-[focus]:outline-white data-[open]:bg-red-700 bg-red-500 hover:bg-red-600"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <ImSpinner6 className="animate-spin w-4 h-4" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};
