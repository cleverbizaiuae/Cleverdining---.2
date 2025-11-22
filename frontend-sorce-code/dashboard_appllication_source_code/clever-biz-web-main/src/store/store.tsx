import { configureStore } from "@reduxjs/toolkit";
import mainSlice from "./main-slice";
import sliceAdminManagement from "../pages/super-admin/redux-slices/slice_admin_management";
import { useDispatch, useSelector } from "react-redux";

export const store = configureStore({
  reducer: {
    main: mainSlice,
    adminManagement: sliceAdminManagement,
  },
});
// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
