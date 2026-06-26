export interface AppUserDto {
  id: number;
  userName: string;
  email: string;
  emailConfirmed: boolean;
  firstName?: string | null;
  lastName?: string | null;
  roles: string[];
  organizationId?: number | null;
  organizationName?: string | null;
  justification?: string | null;
}
