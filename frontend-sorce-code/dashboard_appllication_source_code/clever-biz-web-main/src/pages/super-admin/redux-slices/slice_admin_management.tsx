import { createSlice } from "@reduxjs/toolkit";

const sliceAdminManagement = createSlice({
  name: "sliceAdminManagement",
  initialState: {
    modals: {
      showDetail: false,
      addSubscriber: false,
      data: undefined,
    },
  },
  reducers: {
    hideSubscriberDetail: (state) => {
      state.modals.showDetail = false;
      state.modals.data = undefined;
    },
    showSubscriberDetail: (state, action) => {
      state.modals.showDetail = true;
      state.modals.data = action?.payload;
    },
  },
});

export const { showSubscriberDetail, hideSubscriberDetail } =
  sliceAdminManagement.actions;

export default sliceAdminManagement.reducer;
