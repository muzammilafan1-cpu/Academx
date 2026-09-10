import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'firebase_options.dart';
import 'screens/login_screen.dart';
import 'screens/teacher/teacher_feed.dart';
import 'screens/Admin/admin_feed.dart';
import 'screens/superadmin/superadmin_feed.dart';
import 'screens/student/student_feed_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const AcademexApp());
}

class AcademexApp extends StatelessWidget {
  const AcademexApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Academex',
      home: AuthCheck(),
    );
  }
}

class AuthCheck extends StatelessWidget {
  const AuthCheck({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {

        // Loading
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        // Not logged in
        if (!snapshot.hasData) {
          return const LoginScreen();
        }

        // Logged in → fetch role
        return FutureBuilder<DocumentSnapshot>(
          future: FirebaseFirestore.instance
              .collection('users')
              .doc(FirebaseAuth.instance.currentUser!.uid)
              .get(),
          builder: (context, roleSnapshot) {

            if (roleSnapshot.connectionState == ConnectionState.waiting) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }

            if (!roleSnapshot.hasData) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }

            if (!roleSnapshot.data!.exists) {
              return const Scaffold(
                body: Center(child: Text("Setting up your account...")),
              );
            }

            final data = roleSnapshot.data!.data() as Map<String, dynamic>;
            final role = data['role'];

            if (role == null) {
              return const Scaffold(
                body: Center(child: Text("User role not assigned")),
              );
            }

            switch (role) {
              case 'student':
                return const StudentMainScreen();

              case 'teacher':
                return const TeacherMainScreen();

              case 'admin':
                return const AdminMainScreen();

              case 'superadmin':
                return const SuperAdminMainScreen();

              default:
                return const LoginScreen();
            }
          },
        );
      },
    );
  }
}