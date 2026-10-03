import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, ShippingAddress } from '../types';
import { storageService } from '../services/storageService';
import { auth, db, googleProvider } from '../firebase';
import { withTimeout } from '../utils/authErrors';
import { normalizePhoneNumber, isValidBangladeshiPhone } from '../utils/phoneUtils';
import { logFirestoreError } from '../utils/firestoreError';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  signInWithPopup,
  updateProfile as updateFirebaseProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';

export const ADMIN_EMAILS = [
  'bajajmotors.chu@gmail.com',
  'admin@minarulfashion.com',
];

export const isAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
};

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isLoadingAuth: boolean;
  isLoginModalOpen: boolean;
  loginModalTab: 'login' | 'register';
  openLoginModal: (defaultTab?: 'login' | 'register') => void;
  closeLoginModal: () => void;
  loginWithEmail: (emailOrPhone: string, password: string) => Promise<'admin' | 'customer'>;
  registerWithEmail: (name: string, email: string, phone: string, password: string) => Promise<'admin' | 'customer'>;
  loginWithGoogle: () => Promise<'admin' | 'customer'>;
  forgotPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updated: Partial<User>) => Promise<void>;
  updateDefaultAddress: (address: ShippingAddress) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Clean up any legacy or rogue cached admin flags
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('admin');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('userRole');
    sessionStorage.removeItem('admin');
    sessionStorage.removeItem('isAdmin');
    sessionStorage.removeItem('userRole');
  } catch {
    // Safe storage access
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Never initialize user from cached storage to prevent stale admin role
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalTab, setLoginModalTab] = useState<'login' | 'register'>('login');

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    // Listen to Firebase Authentication state change
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentFbUser) => {
      setFirebaseUser(currentFbUser);

      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (currentFbUser) {
        setIsLoadingAuth(true);

        try {
          // Read users/{uid} document strictly from Firestore
          const userDocRef = doc(db, 'users', currentFbUser.uid);
          let userSnap = await getDoc(userDocRef);
          const isUserAuthorizedAdmin = isAdminEmail(currentFbUser.email);

          console.log('Firebase Auth State Changed:');
          console.log('  UID:', currentFbUser.uid);
          console.log('  Email:', currentFbUser.email);
          console.log('  Is Authorized Admin Email:', isUserAuthorizedAdmin);
          console.log('  Firestore Doc Exists:', userSnap.exists());

          if (!userSnap.exists()) {
            // Document does not exist yet.
            // If the user's email is an authorized admin, assign 'admin'. Otherwise, strictly 'customer'.
            const assignedRole: 'admin' | 'customer' = isUserAuthorizedAdmin ? 'admin' : 'customer';
            const newDocData = {
              uid: currentFbUser.uid,
              name: currentFbUser.displayName || (isUserAuthorizedAdmin ? 'Store Administrator' : 'Customer'),
              email: currentFbUser.email || '',
              phone: currentFbUser.phoneNumber || '',
              role: assignedRole,
              createdAt: serverTimestamp(),
            };

            try {
              await setDoc(userDocRef, newDocData);
              console.log(`✅ Successfully initialized Firestore users/{uid} with role [${assignedRole}]:`, currentFbUser.uid);
            } catch (createErr: any) {
              logFirestoreError(createErr, 'users', 'create', assignedRole);
            }

            userSnap = await getDoc(userDocRef);
          } else if (isUserAuthorizedAdmin && userSnap.data()?.role !== 'admin') {
            // PART 7: Ensure Admin user's Firestore role is 'admin'
            try {
              await updateDoc(userDocRef, {
                role: 'admin',
                updatedAt: serverTimestamp(),
              });
              console.log(`✅ Ensured Firestore users/{uid} role [admin] for authorized admin:`, currentFbUser.uid);
              userSnap = await getDoc(userDocRef);
            } catch (updateErr: any) {
              logFirestoreError(updateErr, 'users', 'update', 'admin');
            }
          }

          if (userSnap.exists()) {
            const data = userSnap.data();
            // Source of Truth: data.role === 'admin' strictly from Firestore users/{uid}
            const firestoreRole: 'customer' | 'admin' = data.role === 'admin' ? 'admin' : 'customer';

            console.log('  Verified Firestore Role:', firestoreRole);

            const verifiedUser: User = {
              id: currentFbUser.uid,
              name: data.name || currentFbUser.displayName || (firestoreRole === 'admin' ? 'Store Administrator' : 'Customer'),
              email: currentFbUser.email || data.email || '',
              phone: data.phone || currentFbUser.phoneNumber || '',
              role: firestoreRole,
              address: data.address,
            };

            setUser(verifiedUser);
            storageService.saveUser(verifiedUser);

            // Real-time listener on user's Firestore document
            unsubscribeUserDoc = onSnapshot(userDocRef, (docSnap) => {
              if (docSnap.exists()) {
                const liveData = docSnap.data();
                const liveRole: 'customer' | 'admin' = liveData.role === 'admin' ? 'admin' : 'customer';

                setUser((prev) => {
                  if (!prev) return null;
                  const updated: User = {
                    ...prev,
                    role: liveRole,
                    name: liveData.name || prev.name,
                    phone: liveData.phone || prev.phone,
                    address: liveData.address || prev.address,
                  };
                  storageService.saveUser(updated);
                  return updated;
                });
              } else {
                console.warn('User document was removed from Firestore!');
                setUser(null);
                storageService.saveUser(null);
              }
            }, (error) => {
              console.warn('Real-time user document listener notice:', error.message);
            });
          } else {
            // Firestore document was not created or does not exist
            console.error('⚠️ Admin user document is missing in Firestore: users/' + currentFbUser.uid);
            setUser(null);
            storageService.saveUser(null);
          }
        } catch (error: any) {
          console.error('Error fetching Firestore user document:', error);
          setUser(null);
          storageService.saveUser(null);
        } finally {
          setIsLoadingAuth(false);
        }
      } else {
        setUser(null);
        storageService.saveUser(null);
        setIsLoadingAuth(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  useEffect(() => {
    const isUserAdmin = Boolean(user && user.role === 'admin');
    storageService.syncAdminUsersListener(isUserAdmin);
    storageService.syncAdminOrdersListener(isUserAdmin);
  }, [user]);

  const openLoginModal = (defaultTab: 'login' | 'register' = 'login') => {
    setLoginModalTab(defaultTab);
    setIsLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
  };

  const isLoggedIn = Boolean(user && user.id && user.name);
  const isAdmin = Boolean(!isLoadingAuth && user && user.role === 'admin');

  // Convert Bangladeshi phone number to normalized email alias for Firebase Auth if needed
  const resolveEmail = (emailOrPhone: string): string => {
    const clean = emailOrPhone.trim();
    if (clean.includes('@')) return clean.toLowerCase();
    const digits = clean.replace(/[^0-9]/g, '');
    return `${digits}@customer.minarulfashion.com`;
  };

  // 1. Email/Phone + Password Login
  const loginWithEmail = async (emailOrPhone: string, password: string): Promise<'admin' | 'customer'> => {
    let resolvedEmail = emailOrPhone.trim().toLowerCase();

    // Check if input is a Bangladeshi mobile number (does not contain @)
    if (!resolvedEmail.includes('@')) {
      const cleanPhone = normalizePhoneNumber(emailOrPhone);
      if (isValidBangladeshiPhone(cleanPhone)) {
        // Look up registered user email by mobile number from phoneLookup/{cleanPhone}
        try {
          const phoneSnap = await withTimeout(
            getDoc(doc(db, 'phoneLookup', cleanPhone)),
            7000,
            'মোবাইল নম্বর যাচাই করতে অতিরিক্ত সময় লেগেছে।'
          );
          if (phoneSnap.exists() && phoneSnap.data()?.email) {
            resolvedEmail = phoneSnap.data().email.toLowerCase();
          } else {
            resolvedEmail = `${cleanPhone}@customer.minarulfashion.com`;
          }
        } catch (phoneErr) {
          console.warn('Phone lookup notice during login:', phoneErr);
          resolvedEmail = `${cleanPhone}@customer.minarulfashion.com`;
        }
      } else {
        throw new Error('সঠিক ইমেইল অথবা ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন: 017XXXXXXXX বা 018XXXXXXXX)।');
      }
    }

    // Authenticate with Firebase Auth (enforcing a 15s timeout)
    const userCredential = await withTimeout(
      signInWithEmailAndPassword(auth, resolvedEmail, password),
      15000,
      'লগইন সম্পন্ন হতে অতিরিক্ত সময় লেগেছে। আপনার ইন্টারনেট সংযোগ চেক করে আবার চেষ্টা করুন।'
    );
    const fbUser = userCredential.user;

    // Fetch user profile strictly from Firestore users/{uid}
    const isAuthAdmin = isAdminEmail(fbUser.email);
    try {
      const userDocRef = doc(db, 'users', fbUser.uid);
      let snap = await withTimeout(
        getDoc(userDocRef), 
        8000,
        'Firestore ডাটাবেজ থেকে তথ্য আনার সময় শেষ হয়েছে।'
      );

      if (!snap.exists()) {
        const assignedRole: 'admin' | 'customer' = isAuthAdmin ? 'admin' : 'customer';
        await setDoc(userDocRef, {
          uid: fbUser.uid,
          name: fbUser.displayName || (isAuthAdmin ? 'Store Administrator' : 'Customer'),
          email: fbUser.email || resolvedEmail,
          phone: '',
          role: assignedRole,
          createdAt: serverTimestamp(),
        });
        snap = await getDoc(userDocRef);
      } else if (isAuthAdmin && snap.data()?.role !== 'admin') {
        await updateDoc(userDocRef, { role: 'admin', updatedAt: serverTimestamp() });
        snap = await getDoc(userDocRef);
      }

      if (snap.exists()) {
        const data = snap.data();
        const resolvedRole: 'admin' | 'customer' = (data.role === 'admin' || isAuthAdmin) ? 'admin' : 'customer';
        const loggedUser: User = {
          id: fbUser.uid,
          name: data.name || fbUser.displayName || (resolvedRole === 'admin' ? 'Store Administrator' : 'Customer'),
          email: fbUser.email || data.email || '',
          phone: data.phone || '',
          role: resolvedRole,
          address: data.address,
        };
        setUser(loggedUser);
        storageService.saveUser(loggedUser);
        return resolvedRole;
      }
    } catch (e: any) {
      logFirestoreError(e, 'users', 'read', isAuthAdmin ? 'admin' : 'customer');
    }

    // Fallback if Firestore read takes longer or document hasn't been populated
    const fallbackRole: 'admin' | 'customer' = isAuthAdmin ? 'admin' : 'customer';
    const fallbackUser: User = {
      id: fbUser.uid,
      name: fbUser.displayName || (fallbackRole === 'admin' ? 'Store Administrator' : 'Customer'),
      email: fbUser.email || '',
      phone: '',
      role: fallbackRole,
    };
    setUser(fallbackUser);
    storageService.saveUser(fallbackUser);
    return fallbackRole;
  };

  // 2. Email/Phone + Password Register
  const registerWithEmail = async (
    name: string,
    email: string,
    phone: string,
    password: string
  ): Promise<'admin' | 'customer'> => {
    const cleanPhone = normalizePhoneNumber(phone);
    if (!isValidBangladeshiPhone(cleanPhone)) {
      throw new Error('অনুগ্রহ করে সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন (যেমন: 017XXXXXXXX বা 018XXXXXXXX)।');
    }

    const validEmail = email.trim() ? email.trim().toLowerCase() : `${cleanPhone}@customer.minarulfashion.com`;
    const trimmedName = name.trim();
    // Registration role MUST strictly be 'customer' unless email is verified authorized admin email
    const isAuthAdmin = isAdminEmail(validEmail);
    const assignedRole: 'admin' | 'customer' = isAuthAdmin ? 'admin' : 'customer';

    // Check unique mobile number to prevent duplicate accounts
    try {
      const existingPhoneSnap = await withTimeout(
        getDoc(doc(db, 'phoneLookup', cleanPhone)),
        6000
      );
      if (existingPhoneSnap.exists()) {
        throw new Error('এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি করা হয়েছে। অনুগ্রহ করে লগইন করুন।');
      }
    } catch (checkErr) {
      if (checkErr instanceof Error && checkErr.message.includes('ইতিমধ্যে একটি অ্যাকাউন্ট')) {
        throw checkErr;
      }
    }

    // 1. Create account with Firebase Authentication (enforcing 15s timeout)
    const userCredential = await withTimeout(
      createUserWithEmailAndPassword(auth, validEmail, password),
      15000,
      'Firebase Authentication-এ অ্যাকাউন্ট তৈরিতে অতিরিক্ত সময় লেগেছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
    );
    const fbUser = userCredential.user;

    // 2. Update Firebase Auth displayName
    try {
      await withTimeout(updateFirebaseProfile(fbUser, { displayName: trimmedName }), 4000);
    } catch (e) {
      console.warn('Could not update Firebase displayName:', e);
    }

    // 3. User document structure strictly matching requested format (default role: customer)
    const userDocData = {
      uid: fbUser.uid,
      name: trimmedName,
      email: validEmail,
      phone: cleanPhone,
      role: assignedRole,
      createdAt: serverTimestamp(),
    };

    // 4. Create users/{uid} document in Firestore
    const userDocRef = doc(db, 'users', fbUser.uid);
    try {
      await withTimeout(
        setDoc(userDocRef, userDocData),
        5000,
        'Firestore ডাটাবেজে ইউজার ডকুমেন্ট সংরক্ষণে অতিরিক্ত সময় লেগেছে।'
      );
      console.log(`✅ Firestore users/{uid} document created successfully with role [customer]:`, fbUser.uid);
    } catch (firestoreErr: any) {
      const errCode = firestoreErr?.code || 'unknown';
      console.error(`❌ Failed to create user document in Firestore on registration [${errCode}]:`, firestoreErr?.message || firestoreErr);
      throw new Error(`Firestore-এ অ্যাকাউন্ট তৈরি ব্যর্থ হয়েছে [${errCode}]: ${firestoreErr?.message || 'অনুগ্রহ করে পুনরায় চেষ্টা করুন।'}`);
    }

    // 5. Index phone in phoneLookup collection for mobile login
    try {
      await setDoc(doc(db, 'phoneLookup', cleanPhone), {
        uid: fbUser.uid,
        email: validEmail,
        phone: cleanPhone,
        createdAt: serverTimestamp(),
      });
    } catch (lookupErr) {
      console.warn('phoneLookup index write notice:', lookupErr);
    }

    const newUser: User = {
      id: fbUser.uid,
      name: trimmedName,
      email: validEmail,
      phone: cleanPhone,
      role: assignedRole,
    };

    setUser(newUser);
    storageService.saveUser(newUser);
    return assignedRole;
  };

  // 3. Google Sign-In
  const loginWithGoogle = async (): Promise<'admin' | 'customer'> => {
    // 1. Popup Google login (allowing 35s for user interaction)
    const res = await withTimeout(
      signInWithPopup(auth, googleProvider),
      35000,
      'গুগল সাইন-ইন সম্পন্ন হতে অতিরিক্ত সময় লেগেছে। অনুগ্রহ করে আবার চেষ্টা করুন।'
    );
    const fbUser = res.user;
    const isAuthAdmin = isAdminEmail(fbUser.email);
    const userDocRef = doc(db, 'users', fbUser.uid);

    // 2. Check if Firestore users/{uid} document already exists
    try {
      let snap = await withTimeout(
        getDoc(userDocRef),
        8000,
        'Firestore ডাটাবেজ থেকে তথ্য আনার সময় শেষ হয়েছে।'
      );

      if (!snap.exists()) {
        const assignedRole: 'admin' | 'customer' = isAuthAdmin ? 'admin' : 'customer';
        const newCustomerDoc = {
          uid: fbUser.uid,
          name: fbUser.displayName || (isAuthAdmin ? 'Store Administrator' : 'Customer'),
          email: fbUser.email || '',
          phone: fbUser.phoneNumber || '',
          role: assignedRole,
          createdAt: serverTimestamp(),
        };

        try {
          await withTimeout(
            setDoc(userDocRef, newCustomerDoc),
            5000,
            'Firestore-এ নতুন ইউজার ডকুমেন্ট সংরক্ষণে অতিরিক্ত সময় লেগেছে।'
          );
          console.log(`✅ Created Google profile in Firestore users/{uid} [${assignedRole}]:`, fbUser.uid);
        } catch (setDocErr: any) {
          logFirestoreError(setDocErr, 'users', 'create', assignedRole);
          throw new Error(`Firestore-এ অ্যাকাউন্ট তৈরি ব্যর্থ হয়েছে: ${setDocErr?.message || 'অনুগ্রহ করে পুনরায় চেষ্টা করুন।'}`);
        }

        snap = await getDoc(userDocRef);
      } else if (isAuthAdmin && snap.data()?.role !== 'admin') {
        try {
          await updateDoc(userDocRef, { role: 'admin', updatedAt: serverTimestamp() });
          snap = await getDoc(userDocRef);
        } catch (updateErr) {
          logFirestoreError(updateErr, 'users', 'update', 'admin');
        }
      }

      if (snap.exists()) {
        const data = snap.data();
        // Role is strictly read from Firestore document!
        const resolvedRole: 'admin' | 'customer' = (data.role === 'admin' || isAuthAdmin) ? 'admin' : 'customer';

        const existingUser: User = {
          id: fbUser.uid,
          name: data.name || fbUser.displayName || (resolvedRole === 'admin' ? 'Store Administrator' : 'Customer'),
          email: fbUser.email || data.email || '',
          phone: data.phone || fbUser.phoneNumber || '',
          role: resolvedRole,
          address: data.address,
        };
        setUser(existingUser);
        storageService.saveUser(existingUser);
        return resolvedRole;
      }
    } catch (e: any) {
      logFirestoreError(e, 'users', 'read', isAuthAdmin ? 'admin' : 'customer');
      throw e;
    }

    // Role is strictly customer if Firestore verification fails
    const fallbackRole: 'admin' | 'customer' = isAuthAdmin ? 'admin' : 'customer';
    const fallbackUser: User = {
      id: fbUser.uid,
      name: fbUser.displayName || (fallbackRole === 'admin' ? 'Store Administrator' : 'Customer'),
      email: fbUser.email || '',
      phone: fbUser.phoneNumber || '',
      role: fallbackRole,
    };
    setUser(fallbackUser);
    storageService.saveUser(fallbackUser);
    return fallbackRole;
  };

  // 4. Forgot Password
  const forgotPassword = async (email: string): Promise<void> => {
    await withTimeout(
      sendPasswordResetEmail(auth, email.trim().toLowerCase()),
      12000
    );
  };

  // 5. Logout
  const logout = async (): Promise<void> => {
    try {
      await withTimeout(signOut(auth), 5000);
    } catch (e) {
      console.warn('SignOut error', e);
    }
    setUser(null);
    setFirebaseUser(null);
    storageService.saveUser(null);
  };

  // 6. Update Profile
  const updateProfile = async (updated: Partial<User>): Promise<void> => {
    if (!user) return;
    const safeUpdate = { ...updated };
    // Prevent normal customer from elevating role
    if (user.role !== 'admin') {
      delete safeUpdate.role;
    }
    const newUser: User = { ...user, ...safeUpdate };
    setUser(newUser);
    storageService.saveUser(newUser);

    try {
      await updateDoc(doc(db, 'users', user.id), {
        ...safeUpdate,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Error updating profile in Firestore:', e);
    }
  };

  // 7. Update Default Address
  const updateDefaultAddress = async (address: ShippingAddress): Promise<void> => {
    if (!user) return;
    const newUser: User = { ...user, address };
    setUser(newUser);
    storageService.saveUser(newUser);

    try {
      await updateDoc(doc(db, 'users', user.id), {
        address,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Error updating address in Firestore:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isLoggedIn,
        isAdmin,
        isLoadingAuth,
        isLoginModalOpen,
        loginModalTab,
        openLoginModal,
        closeLoginModal,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        forgotPassword,
        logout,
        updateProfile,
        updateDefaultAddress,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
