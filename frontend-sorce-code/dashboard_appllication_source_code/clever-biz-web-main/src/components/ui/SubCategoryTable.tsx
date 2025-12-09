import React, { useContext, useEffect, useState } from "react";
import { Trash, Pencil } from "lucide-react";
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
import { EditCategoryModal } from "../modals";

const SubCategoryTable = ({ categories, setCategories }) => {
    const { response } = useContext(WebSocketContext);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [editingCategory, setEditingCategory] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Filter for subcategories (those with a parent_category)
    const subCategories = categories?.filter(c => c.parent_category) || [];

    const openModal = (category) => {
        setCategoryToDelete(category);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setCategoryToDelete(null);
    };

    const openEditModal = (category) => {
        setEditingCategory(category);
        setIsEditModalOpen(true);
    };

    const closeEditModal = () => {
        setEditingCategory(null);
        setIsEditModalOpen(false);
    };

    return (
        <div>
            <div className="overflow-x-auto bg-[#1e2a3a] h-full rounded-lg shadow-lg p-4 w-full">
                <h3 className="text-2xl font-bold mb-4 text-white">Sub Categories</h3>
                <table className="min-w-full text-white">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="p-2 text-left text-gray-200">Sub-Category</th>
                            <th className="p-2 text-left text-gray-200">Parent Category</th>
                            <th className="p-2 text-right text-gray-200">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subCategories.length > 0 ? (
                            subCategories.map((category) => {
                                // Find parent category name
                                const parent = categories.find(c => c.id === category.parent_category);
                                return (
                                    <tr
                                        key={category.id}
                                        className="border-b border-gray-700 hover:bg-[#2a3a4a] transition duration-300"
                                    >
                                        <td className="p-2">
                                            <img
                                                src={(() => {
                                                    if (!category.image) return "https://placehold.co/100x100?text=No+Image";
                                                    let url = category.image;
                                                    // Fix double media path
                                                    // url = url.replace("/media/media/", "/media/");
                                                    // Force HTTPS
                                                    if (url.startsWith("http://")) {
                                                        url = url.replace("http://", "https://");
                                                    }
                                                    // Handle relative paths
                                                    if (url.startsWith("/")) {
                                                        url = `https://cleverdining-2.onrender.com${url}`;
                                                    }
                                                    return url;
                                                })()}
                                                alt={category.Category_name}
                                                className="w-10 h-10 rounded-full object-cover"
                                                onError={(e) => {
                                                    e.currentTarget.src = "https://placehold.co/100x100?text=No+Image";
                                                }}
                                            />
                                        </td>
                                        <td className="p-2">{category.Category_name}</td>
                                        <td className="p-2 text-gray-400">{parent?.Category_name || "Unknown"}</td>
                                        <td className="p-2 text-right">
                                            <button
                                                onClick={() => openEditModal(category)}
                                                className="text-blue-500 hover:text-blue-400 transition-colors duration-200 mr-3"
                                            >
                                                <Pencil size={20} />
                                            </button>
                                            <button
                                                onClick={() => openModal(category)}
                                                className="text-red-500 hover:text-red-700 transition-colors duration-200"
                                                disabled={isDeleting}
                                            >
                                                <Trash size={20} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={3} className="p-4 text-center text-gray-400">
                                    No sub-categories found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <DeleteCategoryModal
                    isOpen={isModalOpen}
                    close={closeModal}
                    id={categoryToDelete?.id}
                    setCategories={setCategories}
                />
            )}

            {isEditModalOpen && (
                <EditCategoryModal
                    isOpen={isEditModalOpen}
                    close={closeEditModal}
                    id={editingCategory?.id}
                    onSuccess={() => {
                        // handled by page reload in modal currently
                    }}
                />
            )}
        </div>
    );
};

const DeleteCategoryModal = ({ isOpen, close, id, setCategories }) => {
    const { response } = useContext(WebSocketContext);
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        if (!id) {
            toast.error("No item selected for deletion.");
            return;
        }

        setLoading(true);

        try {
            await axiosInstance.delete(`/owners/categories/${id}/`);
            toast.success("Category deleted successfully!");
            setCategories((prevCategories) =>
                prevCategories.filter((category) => category.id !== id)
            );
            close();
        } catch (err) {
            console.error("Failed to delete item", err);
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
                            Delete Sub-Category
                        </DialogTitle>
                        <p className="mt-2 text-sm/6 text-white/50">
                            Are you sure you want to delete this Sub-Category? This action cannot be undone.
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

export default SubCategoryTable;
