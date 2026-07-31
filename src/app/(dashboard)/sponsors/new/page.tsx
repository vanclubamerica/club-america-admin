import { redirect } from 'next/navigation';

/** The "Add sponsor" quick action opens the list, where the form lives inline. */
export default function NewSponsorPage() {
  redirect('/sponsors');
}
