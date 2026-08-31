/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export enum ApplicantStatus {
  Failed = 'Failed',
  InEvaluation = 'InEvaluation',
  Passed = 'Passed',
  Pending = 'Pending'
}

export type CreateSessionInput = {
  intent: SessionIntent;
  teacherId: string | number;
};

export enum DisputeResolution {
  Cancel = 'Cancel',
  Complete = 'Complete'
}

export enum Gender {
  Female = 'Female',
  Male = 'Male',
  Other = 'Other'
}

export enum RecitationReading {
  AlBazziAnIbnKathir = 'AL_BAZZI_AN_IBN_KATHIR',
  AlDuriAnAbiAmr = 'AL_DURI_AN_ABI_AMR',
  AlSusiAnAbiAmr = 'AL_SUSI_AN_ABI_AMR',
  HafsAnAsim = 'HAFS_AN_ASIM',
  KhalafAnHamzah = 'KHALAF_AN_HAMZAH',
  KhalladAnAsim = 'KHALLAD_AN_ASIM',
  QalunAnNafi = 'QALUN_AN_NAFI',
  QunbulAnIbnKathir = 'QUNBUL_AN_IBN_KATHIR',
  ShubahAnAsim = 'SHUBAH_AN_ASIM',
  WarshAnNafi = 'WARSH_AN_NAFI'
}

export enum RegisterPublicRole {
  Parent = 'Parent',
  Student = 'Student',
  Teacher = 'Teacher'
}

export type RegisterUserInput = {
  country: string;
  email: string;
  fullName: string;
  gender: Gender | null | undefined;
  password: string;
  phone: string;
  preferredRecitation: RecitationReading | null | undefined;
  role: RegisterPublicRole;
};

export enum SessionIntent {
  Evaluation = 'Evaluation',
  Hifz = 'Hifz',
  Tajweed = 'Tajweed'
}

export type SessionListFilterInput = {
  status: SessionStatus | null | undefined;
};

export enum SessionStatus {
  Cancelled = 'Cancelled',
  Completed = 'Completed',
  Disputed = 'Disputed',
  Scheduled = 'Scheduled',
  Started = 'Started'
}

export enum SessionType {
  ReEvaluation = 'ReEvaluation',
  StudentSession = 'StudentSession',
  TeacherEvaluation = 'TeacherEvaluation'
}

export enum UserRole {
  Admin = 'Admin',
  Parent = 'Parent',
  Student = 'Student',
  Teacher = 'Teacher'
}

export type RegisterUserMutation_registerUser = { id: number, email: string, fullName: string, role: UserRole };

export type RegisterUserMutation = { registerUser: RegisterUserMutation_registerUser };


export type RegisterUserMutationVariables = Exact<{
  input: RegisterUserInput;
}>;

export type MeQuery_me = { id: number, email: string, fullName: string, phone: string | null, country: string | null, gender: Gender | null, role: UserRole, preferredRecitation: RecitationReading | null, isDeleted: boolean, suspended: boolean, isBlocked: boolean };

export type MeQuery = { me: MeQuery_me | null };


export type MeQueryVariables = Exact<{ [key: string]: never; }>;

export type LoginMutation_login_user = { id: number, email: string, fullName: string, phone: string | null, country: string | null, gender: Gender | null, role: UserRole, preferredRecitation: RecitationReading | null, isDeleted: boolean, suspended: boolean, isBlocked: boolean };

export type LoginMutation_login = { accessToken: string, refreshToken: string, user: LoginMutation_login_user };

export type LoginMutation = { login: LoginMutation_login };


export type LoginMutationVariables = Exact<{
  email: string;
  password: string;
}>;

export type RefreshTokenMutation_refreshToken = { accessToken: string, refreshToken: string };

export type RefreshTokenMutation = { refreshToken: RefreshTokenMutation_refreshToken };


export type RefreshTokenMutationVariables = Exact<{
  refreshToken: string;
}>;

export type LogoutMutation_logout = { success: boolean };

export type LogoutMutation = { logout: LogoutMutation_logout };


export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;

export type RecitationReadingsQuery = { recitationReadings: Array<RecitationReading> };


export type RecitationReadingsQueryVariables = Exact<{ [key: string]: never; }>;

export type SessionByIdQuery_sessionById = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type SessionByIdQuery = { sessionById: SessionByIdQuery_sessionById | null };


export type SessionByIdQueryVariables = Exact<{
  id: string | number;
}>;

export type MyStudentSessionsQuery_myStudentSessions_items = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type MyStudentSessionsQuery_myStudentSessions = { page: number, pageSize: number, totalCount: number, items: Array<MyStudentSessionsQuery_myStudentSessions_items> };

export type MyStudentSessionsQuery = { myStudentSessions: MyStudentSessionsQuery_myStudentSessions };


export type MyStudentSessionsQueryVariables = Exact<{
  filter: SessionListFilterInput | null | undefined;
  page: number | null | undefined;
  pageSize: number | null | undefined;
}>;

export type MyTeacherSessionsQuery_myTeacherSessions_items = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type MyTeacherSessionsQuery_myTeacherSessions = { page: number, pageSize: number, totalCount: number, items: Array<MyTeacherSessionsQuery_myTeacherSessions_items> };

export type MyTeacherSessionsQuery = { myTeacherSessions: MyTeacherSessionsQuery_myTeacherSessions };


export type MyTeacherSessionsQueryVariables = Exact<{
  filter: SessionListFilterInput | null | undefined;
  page: number | null | undefined;
  pageSize: number | null | undefined;
}>;

export type CreateSessionMutation_createSession = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type CreateSessionMutation = { createSession: CreateSessionMutation_createSession };


export type CreateSessionMutationVariables = Exact<{
  input: CreateSessionInput;
}>;

export type StartSessionMutation_startSession = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type StartSessionMutation = { startSession: StartSessionMutation_startSession };


export type StartSessionMutationVariables = Exact<{
  id: string | number;
}>;

export type CompleteSessionMutation_completeSession = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type CompleteSessionMutation = { completeSession: CompleteSessionMutation_completeSession };


export type CompleteSessionMutationVariables = Exact<{
  id: string | number;
}>;

export type CancelSessionMutation_cancelSession = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type CancelSessionMutation = { cancelSession: CancelSessionMutation_cancelSession };


export type CancelSessionMutationVariables = Exact<{
  id: string | number;
  reason: string | null | undefined;
}>;

export type OpenSessionDisputeMutation_openSessionDispute = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type OpenSessionDisputeMutation = { openSessionDispute: OpenSessionDisputeMutation_openSessionDispute };


export type OpenSessionDisputeMutationVariables = Exact<{
  id: string | number;
  reason: string;
}>;

export type ResolveSessionDisputeMutation_resolveSessionDispute = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type ResolveSessionDisputeMutation = { resolveSessionDispute: ResolveSessionDisputeMutation_resolveSessionDispute };


export type ResolveSessionDisputeMutationVariables = Exact<{
  id: string | number;
  resolution: DisputeResolution;
  note: string | null | undefined;
}>;

export type AdminDisputedSessionsQuery_adminDisputedSessions_items = { id: string, status: SessionStatus, intent: SessionIntent | null, sessionType: SessionType, fee: string | null, feeHeld: boolean, studentId: string, teacherId: string, startedAt: string | null, endedAt: string | null, confirmationDeadline: string | null, confirmedByStudentAt: string | null, confirmedByTeacherAt: string | null, createdAt: string, updatedAt: string, cancelReason: string | null, disputeReason: string | null, disputedAt: string | null, resolutionNote: string | null, resolvedAt: string | null };

export type AdminDisputedSessionsQuery_adminDisputedSessions = { page: number, pageSize: number, totalCount: number, items: Array<AdminDisputedSessionsQuery_adminDisputedSessions_items> };

export type AdminDisputedSessionsQuery = { adminDisputedSessions: AdminDisputedSessionsQuery_adminDisputedSessions };


export type AdminDisputedSessionsQueryVariables = Exact<{
  filter: SessionListFilterInput | null | undefined;
  limit: number | null | undefined;
  offset: number | null | undefined;
}>;

export type MyApplicantProfileQuery_myApplicantProfile = { id: number, status: ApplicantStatus, verificationAttempts: number, lastAttemptAt: string | null, cooldownUntil: string | null, cooldownActive: boolean, canPurchaseVerification: boolean };

export type MyApplicantProfileQuery = { myApplicantProfile: MyApplicantProfileQuery_myApplicantProfile | null };


export type MyApplicantProfileQueryVariables = Exact<{ [key: string]: never; }>;


export const RegisterUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RegisterUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RegisterUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"registerUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}}]}}]} as unknown as DocumentNode<RegisterUserMutation, RegisterUserMutationVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"preferredRecitation"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}}]}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const LoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Login"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"password"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"login"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"password"},"value":{"kind":"Variable","name":{"kind":"Name","value":"password"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"preferredRecitation"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}}]}},{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const RefreshTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RefreshToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"refreshToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"refreshToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<RefreshTokenMutation, RefreshTokenMutationVariables>;
export const LogoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Logout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"logout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"success"}}]}}]}}]} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const RecitationReadingsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RecitationReadings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recitationReadings"}}]}}]} as unknown as DocumentNode<RecitationReadingsQuery, RecitationReadingsQueryVariables>;
export const SessionByIdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SessionById"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionById"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}}]}}]} as unknown as DocumentNode<SessionByIdQuery, SessionByIdQueryVariables>;
export const MyStudentSessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyStudentSessions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"SessionListFilterInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"page"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myStudentSessions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"page"},"value":{"kind":"Variable","name":{"kind":"Name","value":"page"}}},{"kind":"Argument","name":{"kind":"Name","value":"pageSize"},"value":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"}},{"kind":"Field","name":{"kind":"Name","value":"pageSize"}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}}]} as unknown as DocumentNode<MyStudentSessionsQuery, MyStudentSessionsQueryVariables>;
export const MyTeacherSessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyTeacherSessions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"SessionListFilterInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"page"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myTeacherSessions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"page"},"value":{"kind":"Variable","name":{"kind":"Name","value":"page"}}},{"kind":"Argument","name":{"kind":"Name","value":"pageSize"},"value":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"}},{"kind":"Field","name":{"kind":"Name","value":"pageSize"}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}}]} as unknown as DocumentNode<MyTeacherSessionsQuery, MyTeacherSessionsQueryVariables>;
export const CreateSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateSessionInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}}]}}]} as unknown as DocumentNode<CreateSessionMutation, CreateSessionMutationVariables>;
export const StartSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"StartSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"startSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}}]}}]} as unknown as DocumentNode<StartSessionMutation, StartSessionMutationVariables>;
export const CompleteSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CompleteSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"completeSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}}]}}]} as unknown as DocumentNode<CompleteSessionMutation, CompleteSessionMutationVariables>;
export const CancelSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CancelSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"reason"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"cancelSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"reason"},"value":{"kind":"Variable","name":{"kind":"Name","value":"reason"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}}]}}]} as unknown as DocumentNode<CancelSessionMutation, CancelSessionMutationVariables>;
export const OpenSessionDisputeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"OpenSessionDispute"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"reason"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"openSessionDispute"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"reason"},"value":{"kind":"Variable","name":{"kind":"Name","value":"reason"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}}]}}]} as unknown as DocumentNode<OpenSessionDisputeMutation, OpenSessionDisputeMutationVariables>;
export const ResolveSessionDisputeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ResolveSessionDispute"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"resolution"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DisputeResolution"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"note"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"resolveSessionDispute"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"resolution"},"value":{"kind":"Variable","name":{"kind":"Name","value":"resolution"}}},{"kind":"Argument","name":{"kind":"Name","value":"note"},"value":{"kind":"Variable","name":{"kind":"Name","value":"note"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}}]}}]} as unknown as DocumentNode<ResolveSessionDisputeMutation, ResolveSessionDisputeMutationVariables>;
export const AdminDisputedSessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AdminDisputedSessions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"SessionListFilterInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminDisputedSessions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"intent"}},{"kind":"Field","name":{"kind":"Name","value":"sessionType"}},{"kind":"Field","name":{"kind":"Name","value":"fee"}},{"kind":"Field","name":{"kind":"Name","value":"feeHeld"}},{"kind":"Field","name":{"kind":"Name","value":"studentId"}},{"kind":"Field","name":{"kind":"Name","value":"teacherId"}},{"kind":"Field","name":{"kind":"Name","value":"startedAt"}},{"kind":"Field","name":{"kind":"Name","value":"endedAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmationDeadline"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByStudentAt"}},{"kind":"Field","name":{"kind":"Name","value":"confirmedByTeacherAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"cancelReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputeReason"}},{"kind":"Field","name":{"kind":"Name","value":"disputedAt"}},{"kind":"Field","name":{"kind":"Name","value":"resolutionNote"}},{"kind":"Field","name":{"kind":"Name","value":"resolvedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"page"}},{"kind":"Field","name":{"kind":"Name","value":"pageSize"}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}}]} as unknown as DocumentNode<AdminDisputedSessionsQuery, AdminDisputedSessionsQueryVariables>;
export const MyApplicantProfileDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyApplicantProfile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myApplicantProfile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"verificationAttempts"}},{"kind":"Field","name":{"kind":"Name","value":"lastAttemptAt"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownUntil"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownActive"}},{"kind":"Field","name":{"kind":"Name","value":"canPurchaseVerification"}}]}}]}}]} as unknown as DocumentNode<MyApplicantProfileQuery, MyApplicantProfileQueryVariables>;