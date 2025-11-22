import { EditStaffModal } from "@/components/modals";
import { TableTeamManagement } from "@/components/tables";
import { useOwner } from "@/context/ownerContext";
import { useEffect, useState } from "react";
import { TextSearchBox } from "../../components/input";
import { Pagination } from "../../components/utilities";

/* Screen to list of team management on restaurant end */
const ScreenRestaurantManagement = () => {
  const {
    members,
    membersSearchQuery,
    fetchMembers,
    createMember,
    updateMemberStatus,
    setMembersSearchQuery,
  } = useOwner();

  const [modalOpen, setModalOpen] = useState(false);

  // Load members on component mount and when search query changes

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSearch = (query: string) => {
    setMembersSearchQuery(query);
    fetchMembers(query);
  };

  const handleCreateMember = async (formData: FormData) => {
    try {
      await createMember(formData);
      setModalOpen(false);
    } catch (error) {
      // Error is handled in the context
      console.error("Failed to create member");
    }
  };

  const handleStatusChange = async (memberId: number, newStatus: string) => {
    try {
      await updateMemberStatus(memberId, newStatus);
    } catch (error) {
      // Error is handled in the context
      console.error("Failed to update member status");
    }
  };

  return (
    <>
      <div className="flex flex-col">
        {/* Label */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-y-2 md:gap-y-0 my-4">
          <h2 className="flex-1 text-2xl text-primary-text">Team Management</h2>
          <div className="flex-1 flex gap-x-4 justify-end">
            {/* Search box */}
            <TextSearchBox
              placeholder="Search by name or email"
              value={membersSearchQuery}
              onChange={handleSearch}
            />
            {/* Add member button */}
            <button
              className="h-14 flex items-center bg-sidebar text-primary-text rounded-lg overflow-hidden shadow-md px-6 text-base font-medium hover:bg-primary/80 transition-colors"
              onClick={() => setModalOpen(true)}
              type="button"
            >
              Add Member
            </button>
          </div>
        </div>
        {/* List of content */}
        <div className="bg-sidebar p-4 rounded-lg">
          <TableTeamManagement data={members} />
          <div className="mt-4 flex justify-center">
            <Pagination page={1} total={0} onPageChange={() => {}} />
          </div>
        </div>
      </div>
      {/* Create Member Modal */}
      <EditStaffModal isOpen={modalOpen} close={() => setModalOpen(false)} />
    </>
  );
};

export default ScreenRestaurantManagement;
