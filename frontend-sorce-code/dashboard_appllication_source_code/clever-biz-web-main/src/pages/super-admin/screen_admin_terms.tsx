// src/pages/super-admin/screen_admin_terms.tsx
import { useState, useEffect } from "react";
import {
  BtnBold,
  BtnBulletList,
  BtnItalic,
  BtnLink,
  BtnNumberedList,
  BtnRedo,
  BtnStrikeThrough,
  BtnStyles,
  BtnUndo,
  Editor,
  EditorProvider,
  Toolbar,
} from "react-simple-wysiwyg";
import { IconEdit } from "../../components/icons";
import { useAdmin } from "../../context/adminContext";
import ConfirmDialog, { stripHtml, truncate } from "./ConfirmDialog";
// import ConfirmDialog from "../../components/ConfirmDialog";
// import { stripHtml, truncate } from "../../utils/text";

const ScreenAdminTermsAndCondition = () => {
  const [edit, setEdit] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    termsAndConditions,
    isLoading,
    fetchTermsAndConditions,
    createTermsAndConditions,
    updateTermsAndConditions,
    deleteTermsAndConditions,
  } = useAdmin();

  const [html, setHtml] = useState("");

  useEffect(() => {
    fetchTermsAndConditions();
  }, [fetchTermsAndConditions]);

  const first = termsAndConditions[0];
  const hasRecord = !!first?.id;

  useEffect(() => {
    setHtml(first?.text ?? "");
  }, [first]);

  const handleSave = async () => {
    try {
      if (hasRecord) {
        await updateTermsAndConditions(first!.id, html);
      } else {
        await createTermsAndConditions(html);
      }
      await fetchTermsAndConditions();
      setEdit(false);
    } catch (e) {
      console.error("Failed to save terms and conditions", e);
    }
  };

  const openDelete = () => setConfirmOpen(true);
  const closeDelete = () => setConfirmOpen(false);

  const confirmDelete = async () => {
    if (!hasRecord) return;
    try {
      setDeleting(true);
      await deleteTermsAndConditions(first!.id);
      await fetchTermsAndConditions();
      setHtml("");
      setEdit(false);
    } catch (e) {
      console.error("Failed to delete terms and conditions", e);
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  const preview = truncate(stripHtml(html || "No content"));

  return (
    <EditorProvider>
      <div className="bg-sidebar text-black p-8 rounded-xl shadow-lg w-full">
        <div className="flex flex-row justify-between gap-3 items-start">
          <h2 className="mt-1 text-start text-primary-text text-2xl font-medium">
            Terms & Condition
          </h2>

          <div className="flex gap-2">
            {!edit ? (
              <>
                <button
                  onClick={() => setEdit(true)}
                  disabled={isLoading}
                  className="button-primary bg-accent flex items-center py-2 px-3 gap-x-2 disabled:opacity-50"
                >
                  <IconEdit color="#e1e8ff" />
                  <span>{hasRecord ? "Edit" : "Add"}</span>
                </button>

                {hasRecord && (
                  <button
                    onClick={openDelete}
                    disabled={isLoading}
                    className="button-primary bg-red-600 hover:bg-red-500 flex items-center py-2 px-3 gap-x-2 disabled:opacity-50"
                  >
                    <span>Delete</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="button-primary bg-accent flex items-center py-2 px-3 gap-x-2 disabled:opacity-50"
                >
                  <span>
                    {isLoading
                      ? hasRecord
                        ? "Updating..."
                        : "Creating..."
                      : hasRecord
                      ? "Update"
                      : "Create"}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setEdit(false);
                    setHtml(first?.text ?? "");
                  }}
                  disabled={isLoading}
                  className="button-primary bg-gray-500/80 hover:bg-gray-500 flex items-center py-2 px-3 gap-x-2 disabled:opacity-50"
                >
                  <span>Cancel</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="h-6" />

        {isLoading && !termsAndConditions.length ? (
          <div className="flex justify-center items-center py-8">
            <div className="text-primary-text">
              Loading terms and conditions...
            </div>
          </div>
        ) : !edit ? (
          hasRecord ? (
            <div
              className="[&_*]:list-auto text-primary-text/80 ps-8 list-decimal"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="text-primary-text/70">
              No terms yet. Click “Add”.
            </div>
          )
        ) : (
          <div className="mt-4">
            <Editor
              id="text"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              containerProps={{ className: "max-h-200" }}
              className="[&_*]:list-auto! w-full border-none p-3 bg-input text-primary-text font-poppins placeholder:font-poppins placeholder:text-input-placeholder rounded-md focus:outline-none focus:ring-0"
            >
              <Toolbar className="bg-blue-300 flex items-center [&_svg]:mx-auto">
                <BtnStyles />
                <BtnBold />
                <BtnItalic />
                <BtnBulletList />
                <BtnNumberedList />
                <BtnStrikeThrough />
                <BtnLink />
                <BtnUndo />
                <BtnRedo />
              </Toolbar>
            </Editor>
          </div>
        )}
      </div>

      {/* Delete dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={closeDelete}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete Terms & Conditions"
        message="Are you sure you want to delete the current Terms & Conditions?"
        highlight={preview}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
      />
    </EditorProvider>
  );
};

export default ScreenAdminTermsAndCondition;
