import { useEffect, useState } from "react";
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
import { useAdmin } from "../../context/adminContext";

/** Lightweight inline confirm dialog (no external deps) */
function ConfirmDialog({
  open,
  title,
  message,
  highlight,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onClose,
  onConfirm,
  loading = false,
}: {
  open: boolean;
  title: string;
  message?: string;
  highlight?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-[92%] max-w-md rounded-2xl bg-[#151821] text-white shadow-2xl ring-1 ring-white/10 p-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 8v5m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>
        <h3 className="text-center text-xl font-semibold">{title}</h3>
        {message && (
          <p className="mt-2 text-center text-sm text-gray-300">{message}</p>
        )}
        {highlight && (
          <div className="mt-4 rounded-md bg-white/5 p-3 text-center text-sm text-gray-200">
            {highlight.substring(0, 20)}.....
          </div>
        )}
        <p className="mt-2 text-center text-xs text-red-400">
          This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-white/20 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** utils for preview */
const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
const truncate = (s: string, n = 80) =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;

const ScreenAdminPrivacy = () => {
  const [edit, setEdit] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [html, setHtml] = useState("");

  const {
    privacyPolicy, // array (first item = current policy)
    isLoading,
    fetchPrivacyPolicy,
    createPrivacyPolicy, // <- make sure this exists in context
    updatePrivacyPolicy,
    deletePrivacyPolicy, // <- make sure this exists in context
  } = useAdmin();

  // Load on mount
  useEffect(() => {
    fetchPrivacyPolicy();
  }, [fetchPrivacyPolicy]);

  const current = privacyPolicy?.[0];
  const hasRecord = !!current?.id;

  // Sync editor with current policy
  useEffect(() => {
    setHtml(current?.text ?? ""); // change to .content if your backend uses that field
  }, [current]);

  const handleSave = async () => {
    try {
      if (hasRecord) {
        await updatePrivacyPolicy(current!.id, html);
      } else {
        await createPrivacyPolicy(html);
      }
      await fetchPrivacyPolicy();
      setEdit(false);
    } catch (e) {
      console.error("Failed to save policy", e);
    }
  };

  const openDelete = () => setConfirmOpen(true);
  const closeDelete = () => setConfirmOpen(false);

  const confirmDelete = async () => {
    if (!hasRecord) return;
    try {
      setDeleting(true);
      await deletePrivacyPolicy(current!.id);
      await fetchPrivacyPolicy();
      setHtml("");
      setEdit(false);
    } catch (e) {
      console.error("Failed to delete policy", e);
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
            Privacy Policy
          </h2>

          {/* Action buttons */}
          <div className="flex gap-2">
            {!edit ? (
              <>
                <button
                  onClick={() => setEdit(true)}
                  disabled={isLoading}
                  className="button-primary bg-accent flex items-center py-2 px-3 gap-x-2 disabled:opacity-50"
                >
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
                    setHtml(current?.text ?? "");
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

        {/* Content */}
        {isLoading && !privacyPolicy?.length ? (
          <div className="flex justify-center items-center py-8">
            <div className="text-primary-text">Loading privacy policy...</div>
          </div>
        ) : !edit ? (
          hasRecord ? (
            <div
              className="[&_*]:list-auto text-primary-text/80 ps-8 list-decimal"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <div className="text-primary-text/70">
              No policy yet. Click “Add”.
            </div>
          )
        ) : (
          <div className="mt-4">
            <Editor
              id="policy"
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={closeDelete}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete Policy"
        message="Are you sure you want to delete the current policy?"
        highlight={preview}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />
    </EditorProvider>
  );
};

export default ScreenAdminPrivacy;
