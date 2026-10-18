import React, { useEffect, useState, createContext, useContext } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { collection, getDocs, writeBatch, doc, query, where } from 'firebase/firestore';
import { mockDrivers, mockOrders } from '../data/mockData';

const AuthContext = createContext<{ user: User | null; loading: boolean }>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await seedDataIfEmpty(currentUser.uid);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex inset-0 items-center justify-center text-slate-200">Loading OptiRoute Demo...</div>;
  }

  if (!user) {
    return (
       <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200 gap-6">
         <div className="w-16 h-16 bg-blue-600 text-white flex items-center justify-center rounded-2xl shadow-lg shadow-blue-500/20 mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
         </div>
         <h1 className="text-2xl font-bold">LogiFlow VRP Platform</h1>
         <p className="text-slate-400 max-w-sm text-center text-sm">Please sign in to access the route optimization engine and driver dispatch interface.</p>
         <button onClick={signIn} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl shadow-lg shadow-blue-600/30 transition-all font-semibold">
           Sign In with Google
         </button>
       </div>
    );
  }

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

async function seedDataIfEmpty(userId: string) {
  try {
    const q = query(collection(db, 'drivers'), where('userId', '==', userId));
    const driversSnap = await getDocs(q);
    if (driversSnap.empty) {
      const batch = writeBatch(db);
      for (const d of mockDrivers) {
        batch.set(doc(db, 'drivers', d.id), { ...d, userId });
      }
      for (const o of mockOrders) {
         // remove array structure, adapt
        batch.set(doc(db, 'orders', o.id), { ...o, userId });
      }
      await batch.commit();
    }
  } catch(error) {
    handleFirestoreError(error, OperationType.GET, 'drivers');
  }
}
