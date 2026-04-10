'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api/users.api';
import { useAuthStore } from '@/store/auth.store';
import { queryKeys } from '@/lib/query/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BillingPage from './billing/page';

const TABS = ['Profile', 'Security', 'Billing'] as const;
type Tab = (typeof TABS)[number];

const profileSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  jobTitle: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'Min 8 characters'),
    confirmNewPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.accessToken);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      jobTitle: user?.jobTitle ?? '',
      phone: user?.phone ?? '',
      timezone: user?.timezone ?? 'UTC',
    },
  });

  const onSubmit = async (data: ProfileForm) => {
    try {
      const updated = await usersApi.updateProfile(data);
      setAuth(updated as any, token ?? '');
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>First Name</Label><Input {...register('firstName')} />{errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}</div>
        <div><Label>Last Name</Label><Input {...register('lastName')} />{errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}</div>
      </div>
      <div><Label>Job Title</Label><Input {...register('jobTitle')} /></div>
      <div><Label>Phone</Label><Input {...register('phone')} /></div>
      <div><Label>Timezone</Label><Input {...register('timezone')} placeholder="UTC" /></div>
      <Button type="submit" isLoading={isSubmitting}>Save Changes</Button>
    </form>
  );
}

function SecurityTab() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (data: PasswordForm) => {
    try {
      await usersApi.changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword });
      toast.success('Password changed');
      reset();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Error');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
      <div><Label>Current Password</Label><Input type="password" {...register('currentPassword')} />{errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword.message}</p>}</div>
      <div><Label>New Password</Label><Input type="password" {...register('newPassword')} />{errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword.message}</p>}</div>
      <div><Label>Confirm New Password</Label><Input type="password" {...register('confirmNewPassword')} />{errors.confirmNewPassword && <p className="text-xs text-red-500">{errors.confirmNewPassword.message}</p>}</div>
      <Button type="submit" isLoading={isSubmitting}>Change Password</Button>
    </form>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('Profile');

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === 'Billing' ? (
        <BillingPage />
      ) : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{tab}</CardTitle></CardHeader>
          <CardContent>
            {tab === 'Profile' && <ProfileTab />}
            {tab === 'Security' && <SecurityTab />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
