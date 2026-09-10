import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class TeacherDiaryScreen extends StatefulWidget {
  const TeacherDiaryScreen({super.key});

  @override
  State<TeacherDiaryScreen> createState() => _TeacherDiaryScreenState();
}

class _TeacherDiaryScreenState extends State<TeacherDiaryScreen> {

  final titleController = TextEditingController();
  final contentController = TextEditingController();

  String? institutionId;

  /// 🔥 TEMP DROPDOWN (we upgrade later)
  String selectedClass = "10";
  String selectedSection = "A";

  final List<String> classes = ["8", "9", "10", "11", "12"];
  final List<String> sections = ["A", "B", "C"];

  @override
  void initState() {
    super.initState();
    fetchInstitution();
  }

  Future<void> fetchInstitution() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    institutionId = userDoc.data()?['institutionId'];

    setState(() {});
  }

  /// 🔥 ADD DIARY
  Future<void> addDiary() async {
    if (titleController.text.isEmpty ||
        contentController.text.isEmpty ||
        institutionId == null) return;

    await FirebaseFirestore.instance.collection('diary').add({
      "title": titleController.text.trim(),
      "content": contentController.text.trim(),
      "class": selectedClass,
      "section": selectedSection,
      "institutionId": institutionId,
      "createdBy": FirebaseAuth.instance.currentUser!.uid,
      "timestamp": FieldValue.serverTimestamp(),
    });

    await FirebaseFirestore.instance.collection('alerts').add({
      'institutionId': institutionId,
      'title': "New Diary Update",
      'message': "New homework added for Class $selectedClass-$selectedSection",
      'source': "diary",
      'referenceId': "", // optional (we improve later)
      'targetRoles': ["student"],
      'createdAt': FieldValue.serverTimestamp(),
      'read': false,
    });

    titleController.clear();
    contentController.clear();

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Diary Added")),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade100,

      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.black),
        title: const Text(
          "Diary",
          style: TextStyle(color: Colors.black),
        ),
      ),

      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [

            /// 🔥 FORM CARD
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Column(
                children: [

                  /// TITLE
                  TextField(
                    controller: titleController,
                    decoration: InputDecoration(
                      hintText: "Title",
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  /// CONTENT
                  TextField(
                    controller: contentController,
                    maxLines: 4,
                    decoration: InputDecoration(
                      hintText: "Content",
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                  ),

                  const SizedBox(height: 12),

                  /// CLASS + SECTION
                  Row(
                    children: [

                      Expanded(
                        child: DropdownButtonFormField(
                          value: selectedClass,
                          decoration: const InputDecoration(
                            labelText: "Class",
                            border: OutlineInputBorder(),
                          ),
                          items: classes.map((e) {
                            return DropdownMenuItem(
                              value: e,
                              child: Text("Class $e"),
                            );
                          }).toList(),
                          onChanged: (val) {
                            setState(() {
                              selectedClass = val!;
                            });
                          },
                        ),
                      ),

                      const SizedBox(width: 10),

                      Expanded(
                        child: DropdownButtonFormField(
                          value: selectedSection,
                          decoration: const InputDecoration(
                            labelText: "Section",
                            border: OutlineInputBorder(),
                          ),
                          items: sections.map((e) {
                            return DropdownMenuItem(
                              value: e,
                              child: Text("Section $e"),
                            );
                          }).toList(),
                          onChanged: (val) {
                            setState(() {
                              selectedSection = val!;
                            });
                          },
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  /// BUTTON
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: addDiary,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.black,
                        padding:
                        const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(30),
                        ),
                      ),
                      child: const Text("Add Diary"),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            /// 🔥 LIST FROM FIREBASE
            StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('diary')
                  .where('institutionId', isEqualTo: institutionId)
                  .orderBy('timestamp', descending: true)
                  .snapshots(),
              builder: (context, snapshot) {

                if (!snapshot.hasData) {
                  return const CircularProgressIndicator();
                }

                final docs = snapshot.data!.docs;

                if (docs.isEmpty) {
                  return const Text("No diary entries yet");
                }

                return ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: docs.length,
                  itemBuilder: (context, index) {

                    final data = docs[index];

                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: Colors.grey.shade200),
                      ),
                      child: Column(
                        crossAxisAlignment:
                        CrossAxisAlignment.start,
                        children: [

                          Text(
                            data['title'] ?? "",
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                            ),
                          ),

                          const SizedBox(height: 6),

                          Text(data['content'] ?? ""),

                          const SizedBox(height: 6),

                          Text(
                            "Class ${data['class']} - ${data['section']}",
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}