import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {

  bool loading = true;

  String name = "";
  String email = "";
  String role = "";
  String institutionId = "";

  String institutionName = "";
  String institutionAddress = "";
  String institutionLogo = "";

  String studentClass = "";
  String section = "";

  Color institutionColor = Colors.blue;

  @override
  void initState() {
    super.initState();
    fetchProfile();
  }

  Future<void> fetchProfile() async {

    final user = FirebaseAuth.instance.currentUser;

    if (user == null) return;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    final userData = userDoc.data();

    institutionId = userData?['institutionId'] ?? "";

    name = userData?['name'] ?? "";
    email = user.email ?? "";
    role = userData?['role'] ?? "";

    /// Fetch institution
    final instDoc = await FirebaseFirestore.instance
        .collection('institutions')
        .doc(institutionId)
        .get();

    final instData = instDoc.data();

    institutionName = instData?['name'] ?? "";
    institutionAddress = instData?['address'] ?? "";
    institutionLogo = instData?['logoUrl'] ?? "";

    final colorHex = instData?['primaryColor'];

    if (colorHex != null) {
      institutionColor = hexToColor(colorHex);
    }

    /// Fetch student details (from subcollection)
    final studentDoc = await FirebaseFirestore.instance
        .collection('institutions')
        .doc(institutionId)
        .collection('users')
        .doc(user.uid)
        .get();

    final studentData = studentDoc.data();

    studentClass = studentData?['class'] ?? "";
    section = studentData?['section'] ?? "";

    setState(() {
      loading = false;
    });
  }

  Color hexToColor(String hex) {
    final buffer = StringBuffer();

    if (hex.length == 7 || hex.length == 6) {
      buffer.write('ff');
    }

    buffer.write(hex.replaceFirst('#', ''));

    return Color(int.parse(buffer.toString(), radix: 16));
  }

  @override
  Widget build(BuildContext context) {

    if (loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(

      backgroundColor: Theme.of(context).scaffoldBackgroundColor,

      body: SingleChildScrollView(
        child: Column(
          children: [

            /// HEADER
            Container(
              width: double.infinity,
              padding: const EdgeInsets.only(
                top: 60,
                bottom: 30,
              ),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    institutionColor,
                    institutionColor.withOpacity(0.85),
                  ],
                ),
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(30),
                  bottomRight: Radius.circular(30),
                ),
              ),

              child: Column(
                children: [

                  CircleAvatar(
                    radius: 40,
                    backgroundColor: Colors.white,

                    backgroundImage: institutionLogo.isNotEmpty
                        ? NetworkImage(institutionLogo)
                        : null,

                    child: institutionLogo.isEmpty
                        ? Text(
                      name.isNotEmpty ? name[0].toUpperCase() : "",
                      style: TextStyle(
                        fontSize: 24,
                        color: institutionColor,
                        fontWeight: FontWeight.bold,
                      ),
                    )
                        : null,
                  ),

                  const SizedBox(height: 10),

                  Text(
                    name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),

                  Text(
                    email,
                    style: const TextStyle(
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            /// PROFILE INFO CARD
            buildCard(
              children: [
                buildTile("Role", role),
                buildTile("Class", studentClass),
                buildTile("Section", section),
              ],
            ),

            /// ACCOUNT SECTION
            if (role == "student") ...[
              buildSectionTitle("Accounts"),

              buildCard(
                children: [

                  ListTile(
                    leading: Icon(Icons.person, color: institutionColor),
                    title: const Text("Current Account"),
                    subtitle: Text(name),
                    trailing: const Icon(Icons.check_circle, color: Colors.green),
                  ),

                  const Divider(),

                  ListTile(
                    leading: const Icon(Icons.add),
                    title: const Text("Add Another Account"),
                    subtitle: const Text("Coming soon"),
                  ),
                ],
              ),
            ],

            /// INSTITUTION
            buildSectionTitle("Institution"),

            buildCard(
              children: [
                ListTile(
                  leading: const Icon(Icons.school),
                  title: Text(institutionName),
                  subtitle: Text(institutionAddress),
                ),
              ],
            ),

            /// ACTIONS
            buildSectionTitle("Actions"),

            buildCard(
              children: [

                ListTile(
                  leading: const Icon(Icons.edit),
                  title: const Text("Edit Profile"),
                  subtitle: const Text("Coming soon"),
                ),

                const Divider(),

                ListTile(
                  leading: const Icon(Icons.logout, color: Colors.red),
                  title: const Text("Logout"),
                  onTap: () async {

                    final confirm = await showDialog(
                      context: context,
                      builder: (context) => AlertDialog(
                        title: const Text("Logout"),
                        content: const Text("Are you sure you want to logout?"),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text("Cancel"),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text("Logout"),
                          ),
                        ],
                      ),
                    );

                    if (confirm == true) {
                      await FirebaseAuth.instance.signOut();

                      if (!mounted) return;

                      Navigator.of(context).popUntil((route) => route.isFirst);
                    }
                  },
                ),
              ],
            ),

            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }

  Widget buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  Widget buildCard({required List<Widget> children}) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      padding: const EdgeInsets.all(8),

      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 12,
          )
        ],
      ),

      child: Column(children: children),
    );
  }

  Widget buildTile(String title, String value) {
    return ListTile(
      title: Text(title),
      subtitle: Text(value),
    );
  }
}