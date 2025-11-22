import { cn } from "clsx-for-tailwind";
import { IoChevronUpCircleOutline } from "react-icons/io5";
import { AnimatePresence } from "motion/react";
import { motion } from "motion/react";
import { Disclosure } from "@headlessui/react";
import { DisclosureButton } from "@headlessui/react";
import { MouseEvent, useState, useEffect } from "react";
import { ModalFaqEditor, DeleteFaqModal } from "../../components/modals";
import { IoMdAdd } from "react-icons/io";
import { EditorProvider } from "react-simple-wysiwyg";
import { useAdmin } from "../../context/adminContext";

const ScreenAdminFaq = () => {
  const [edit, setEdit] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<number | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [faqToDelete, setFaqToDelete] = useState<{
    id: number;
    question: string;
  } | null>(null);
  const { faqs, isLoading, fetchFAQs, deleteFAQ } = useAdmin();
  console.log(faqs);
  // Fetch FAQs on component mount
  useEffect(() => {
    fetchFAQs();
  }, [fetchFAQs]);

  const onEditFaq = (e: MouseEvent<HTMLButtonElement>, faqId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingFaqId(faqId);
    setEdit(true);
  };

  const onAddFaq = () => {
    setEditingFaqId(null);
    setEdit(true);
  };

  const onDeleteFaq = async (
    e: MouseEvent<HTMLButtonElement>,
    faqId: number,
    faqQuestion: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setFaqToDelete({ id: faqId, question: faqQuestion });
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (faqToDelete) {
      try {
        await deleteFAQ(faqToDelete.id);
      } catch (error) {
        console.error("Failed to delete FAQ");
      }
    }
  };
  return (
    <EditorProvider>
      <section className="pb-16">
        <div className="container-content mx-auto">
          <div className="flex flex-row justify-between">
            <h2 className="mt-4 text-start text-primary-text text-2xl font-medium">
              Frequently Asked Questions
            </h2>
            <button
              onClick={onAddFaq}
              disabled={isLoading}
              className="button-primary bg-sidebar flex flex-row justify-center items-center py-2 disabled:opacity-50"
            >
              <IoMdAdd /> <span>Add FAQ</span>
            </button>
          </div>
          <div className="space-y-4 mt-16">
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <div className="text-primary-text">Loading FAQs...</div>
              </div>
            ) : faqs.length === 0 ? (
              <div className="flex justify-center items-center py-8">
                <div className="text-primary-text">No FAQs available.</div>
              </div>
            ) : (
              /* Faq list section */
              faqs?.map((faq, index) => (
                <Disclosure key={index} defaultOpen={index === 0} as="div">
                  {({ open }) => (
                    <>
                      {/* Expand button with question */}
                      <DisclosureButton
                        as="div"
                        className="flex w-full justify-between items-center p-4 text-left text-primary-text bg-primary focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md cursor-pointer"
                      >
                        <div className="flex flex-row gap-x-2">
                          <span className="h-6 w-6">
                            <svg
                              className="h-6 w-6"
                              viewBox="0 0 34 32"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <rect
                                width="22.5882"
                                height="22.5882"
                                fill="#5661F6"
                                fillOpacity="0.2"
                              />
                              <rect
                                x="11.2939"
                                y="9.41174"
                                width="22.5882"
                                height="22.5882"
                                fill="#5661F6"
                              />
                            </svg>
                          </span>
                          <span className="text-lg font-medium">
                            {faq.question}
                          </span>
                        </div>
                        <div className="flex items-center gap-x-4">
                          <button
                            className="button-primary px-4 py-2 hover:scale-110"
                            onClick={(e) => onEditFaq(e, faq.id)}
                          >
                            Edit
                          </button>
                          <button
                            className="button-primary px-4 py-2 hover:scale-110 bg-red-600 hover:bg-red-700"
                            onClick={(e) =>
                              onDeleteFaq(e, faq.id, faq.question)
                            }
                          >
                            Delete
                          </button>
                          <IoChevronUpCircleOutline
                            className={cn(
                              { "transform rotate-180": !open },
                              "h-6 w-6 text-primary-text"
                            )}
                          />
                        </div>
                      </DisclosureButton>
                      {/* Expandable container with answer */}
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            key="content"
                            initial="collapsed"
                            animate="open"
                            exit="collapsed"
                            variants={{
                              open: { height: "auto", opacity: 1 },
                              collapsed: { height: 0, opacity: 0 },
                            }}
                            transition={{
                              duration: 0.3,
                              ease: [0.4, 0, 0.2, 1],
                            }}
                            className="overflow-hidden pt-0 text-primary"
                          >
                            <div
                              className="bg-primary-text p-4 rounded-b-md"
                              dangerouslySetInnerHTML={{
                                __html: faq.answer,
                              }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </Disclosure>
              ))
            )}
          </div>
        </div>
      </section>
      <ModalFaqEditor
        isOpen={edit}
        close={() => setEdit(false)}
        id={editingFaqId}
      />
      <DeleteFaqModal
        isOpen={deleteModalOpen}
        close={() => setDeleteModalOpen(false)}
        faqId={faqToDelete?.id || null}
        faqQuestion={faqToDelete?.question || ""}
        onConfirm={handleConfirmDelete}
      />
    </EditorProvider>
  );
};

export default ScreenAdminFaq;
